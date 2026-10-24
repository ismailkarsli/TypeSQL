// Splits a PostgreSQL regression script into the statements psql sends, and reads the expected
// output to find what the server did with each one. Mirrors the rules of psql's lexer
// (src/fe_utils/psqlscan.l) that decide where a statement ends.

/** Variables psql sets itself (their values depend on the session). */
const PSQL_VARIABLES = new Set([
  "AUTOCOMMIT", "DBNAME", "ENCODING", "ERROR", "HOST", "LASTOID", "LAST_ERROR_MESSAGE", "LAST_ERROR_SQLSTATE", "PORT",
  "ROW_COUNT", "SERVER_VERSION_NAME", "SERVER_VERSION_NUM", "SHELL_ERROR", "SHELL_EXIT_CODE", "SQLSTATE", "USER",
  "VERSION", "VERSION_NAME", "VERSION_NUM", "PIPELINE_SYNC_COUNT", "PIPELINE_COMMAND_COUNT", "PIPELINE_RESULT_COUNT",
]);

/** Meta-commands that send the query buffer. */
const SENDS = new Set(["g", "gx", "gset", "gexec", "gdesc", "crosstabview", "watch", "sendpipeline", "parse"]);
// Identifier characters as psql's lexer sees them: every non-ASCII character counts as a letter.
const IDENT_START = /[A-Za-z_]|[^\x00-\x7f]/;
const IDENT_CONT = /[A-Za-z0-9_$]|[^\x00-\x7f]/;
const WORD = /^(?:[A-Za-z_]|[^\x00-\x7f])(?:[A-Za-z0-9_$]|[^\x00-\x7f])*/;
const DOLLAR_QUOTE = /^\$(?:(?:[A-Za-z_]|[^\x00-\x7f])(?:[A-Za-z0-9_]|[^\x00-\x7f])*)?\$/;

/**
 * @typedef {object} Statement
 * @property {string} sql       Text sent to the server, without the comments before it.
 * @property {number} line      1-based line of the first token.
 * @property {number} endLine   1-based line where the statement ends.
 * @property {boolean} psqlVars Uses a psql variable whose value we don't know (see `splitPsql`).
 * @property {boolean} conditional Inside an `\if` branch whose condition we cannot evaluate (a variable).
 * @property {boolean} nonstandardStrings Run with standard_conforming_strings off and has a backslash:
 *   its string literals mean something else than the parser (which follows the default) reads.
 * @property {"ok" | "error" | "syntax-error" | "unknown"} [pg] Set by `classify`.
 * @property {string} [pgError] First error line Postgres printed for it.
 * @property {string} [copyData] For COPY FROM STDIN: the data lines that follow it, up to `\.`.
 */

/**
 * @typedef {object} SplitOptions
 * @property {Record<string, string>} [env] Environment for `\getenv`. Given, `\getenv` reads it
 *   and `\set` concatenates its arguments (`\set f :dir '/data/x'`) as psql does; without it
 *   (pg-regress) both leave the variable unknown.
 */

/**
 * Split a psql script into statements. `result.dataLines` holds the 0-based lines that are
 * COPY FROM STDIN data.
 *
 * psql variables are substituted where the text psql sends can be known: `:'name'` is always a
 * string literal and `:"name"` a quoted identifier (whatever the value), and `:name` takes the
 * value of an earlier `\set name value`. A variable whose value is unknown (`\gset`,
 * `\getenv`, psql's own variables) used bare makes the statement `psqlVars`. An undefined
 * variable is sent as written, as psql does (`arr[1:n]` is a slice).
 * @param {string} text
 * @param {SplitOptions} [options]
 * @returns {Statement[] & { dataLines: Set<number> }}
 */
export function splitPsql(text, options = {}) {
  const lines = text.split("\n");
  const out = Object.assign([], { dataLines: new Set() });
  let buf = "";
  /** Line and buffer offset of the statement's first token. */
  let startLine = -1;
  let startIdx = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let beginDepth = 0;
  /** First unquoted words at parenthesis depth 0, as psql records them. */
  let initIdents = [];
  let psqlVars = false;
  let substitutedSemicolon = false;
  /** psql variables: name → value, or `null` when set but unknown (`\getenv`). */
  const vars = new Map();
  /** A `\gset` ran: it defines variables named after its query's columns. */
  let gset = false;
  const known = (name) => vars.has(name) || PSQL_VARIABLES.has(name);
  const maybeDefined = (name) => known(name) || gset;
  /**
   * One entry per open `\if`: whether the current branch runs (`null`: unknown, it tests a
   * variable) and whether an earlier branch ran. psql reads nothing in a branch that does not run.
   * @type {{ active: boolean | null, taken: boolean | null }[]}
   */
  const ifs = [];
  const running = () => ifs.every((b) => b.active !== false);
  const conditional = () => ifs.some((b) => b.active === null);
  /** COPY FROM STDIN blocks that follow the current line (several with `\;`). */
  let copyBlocks = 0;
  const copying = [];
  let stdStrings = true;
  let commentDepth = 0;
  /**
   * Open quote: `'` (backslash escapes only with standard_conforming_strings off), `e'`
   * (always), `raw'` (never: U&'', B'', X''), `"`, or a dollar quote's delimiter.
   * @type {null | string}
   */
  let quote = null;

  const reset = () => {
    buf = "";
    startLine = -1;
    parenDepth = 0;
    bracketDepth = 0;
    beginDepth = 0;
    initIdents = [];
    psqlVars = false;
    substitutedSemicolon = false;
  };

  const flush = (endLine) => {
    const sql = buf.slice(startIdx).trim();
    if (startLine >= 0 && sql !== ";") {
      // psql scans a substituted value like typed input: a `;` in it ends a statement.
      const parts = substitutedSemicolon ? splitPsql(sql).map((p) => p.sql) : [sql];
      for (const part of parts) out.push({ sql: part, line: startLine + 1, endLine: endLine + 1, psqlVars, conditional: conditional(), nonstandardStrings: !stdStrings && part.includes("\\") });
      if (isCopyFromStdin()) {
        copyBlocks++;
        copying.push(out.at(-1));
      }
      const words = sql.replace(/--[^\n]*/g, "").toLowerCase().split(/[\s=]+/).filter(Boolean);
      if ((words[0] === "set" || words[0] === "reset") && words.includes("standard_conforming_strings")) {
        stdStrings = words[0] === "reset" || !/\b(off|false)\b/.test(words.slice(2).join(" "));
      }
    }
    reset();
  };

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    if (copyBlocks > 0) {
      out.dataLines.add(ln);
      const target = copying[0];
      if (line === "\\.") {
        copyBlocks--;
        copying.shift();
      } else if (target) target.copyData = `${target.copyData ?? ""}${line}\n`;
      continue;
    }
    let i = 0;
    while (i < line.length) {
      // In a branch that does not run, only meta-commands are read (and only the \if family acts).
      if (!running() && !quote && !commentDepth && line[i] !== "\\") {
        const k = line.indexOf("\\", i);
        if (k < 0) break;
        i = k;
      }
      const c = line[i];
      if (commentDepth) {
        if (line.startsWith("*/", i)) { commentDepth--; buf += "*/"; i += 2; }
        else if (line.startsWith("/*", i)) { commentDepth++; buf += "/*"; i += 2; }
        else { buf += c; i++; }
        continue;
      }
      if (quote === "'" || quote === "e'" || quote === "raw'") {
        if (c === "\\" && (quote === "e'" || (quote === "'" && !stdStrings))) { buf += line.slice(i, i + 2); i += 2; continue; }
        if (c === "'" && line[i + 1] === "'") { buf += "''"; i += 2; continue; }
        if (c === "'") quote = null;
        buf += c; i++;
        continue;
      }
      if (quote === '"') {
        if (c === '"' && line[i + 1] === '"') { buf += '""'; i += 2; continue; }
        if (c === '"') quote = null;
        buf += c; i++;
        continue;
      }
      if (quote) {
        if (line.startsWith(quote, i)) { buf += quote; i += quote.length; quote = null; }
        else { buf += c; i++; }
        continue;
      }
      if (/\s/.test(c)) { buf += c; i++; continue; }
      if (line.startsWith("--", i)) { buf += line.slice(i); break; }
      if (line.startsWith("/*", i)) { commentDepth = 1; buf += "/*"; i += 2; continue; }
      if (c === "\\") {
        // `\;` puts a semicolon in the buffer without sending it; the server still runs the
        // parts as separate statements, so they are separate statements here too.
        if (line[i + 1] === ";") {
          buf += ";"; i += 2;
          if (parenDepth === 0 && beginDepth === 0) flush(ln);
          continue;
        }
        if (line[i + 1] === ":") { buf += ":"; i += 2; continue; }
        // `\\` ends a meta-command; the SQL text goes on after it.
        if (line[i + 1] === "\\") { i += 2; continue; }
        const cmd = /^\\([A-Za-z_?!.]*)/.exec(line.slice(i))[1];
        // The arguments end at the next unquoted backslash: another meta-command, or `\\`.
        let end = i + 1 + cmd.length;
        for (let q = false; end < line.length && (q || line[end] !== "\\"); end++) if (line[end] === "'") q = !q;
        const args = line.slice(i + 1 + cmd.length, end);
        if (cmd === "if" || cmd === "elif" || cmd === "else" || cmd === "endif") branch(cmd, args);
        else if (!running()) { /* skipped */ }
        else if (cmd === "set") setVar(args);
        else if (cmd === "unset") vars.delete(args.trim());
        else if (cmd === "getenv") {
          const [name, from] = args.trim().split(/\s+/);
          vars.set(name, options.env ? options.env[from] ?? null : null);
        }
        else if (cmd === "gset") gset = true;
        else if (cmd === "r" || cmd === "reset") reset();
        else if (cmd === "copy" && /\bfrom\s+p?stdin\b/i.test(args)) copyBlocks++;
        if (SENDS.has(cmd) && running()) flush(ln);
        i = end;
        continue;
      }
      if (startLine < 0) { startLine = ln; startIdx = buf.length; }
      if (c === "'") {
        const prev = buf.slice(-1);
        const prefixed = (p) => p.test(prev) && !IDENT_CONT.test(buf.slice(-2, -1));
        quote = prefixed(/[eE]/) ? "e'" : prefixed(/[bBxX]/) || (prev === "&" && /(^|[^A-Za-z0-9_$])[uU]&$/.test(buf.slice(-3))) ? "raw'" : "'";
        buf += c; i++;
        continue;
      }
      if (c === '"') { quote = '"'; buf += c; i++; continue; }
      if (c === "$") {
        const m = DOLLAR_QUOTE.exec(line.slice(i));
        if (m && !IDENT_CONT.test(buf.slice(-1))) { quote = m[0]; buf += m[0]; i += m[0].length; continue; }
        buf += c; i++;
        continue;
      }
      if (c === ":" && line[i + 1] !== ":" && buf.slice(-1) !== ":") {
        const v = /^:(?:(['"])([A-Za-z0-9_]+)\1|([A-Za-z0-9_]+)|\{\?([A-Za-z0-9_]+)\})/.exec(line.slice(i));
        if (v) {
          const [all, q, qname, bare, test] = v;
          const name = qname ?? bare ?? test;
          if (q && maybeDefined(name)) {
            // A literal or identifier whatever the value: substitute a stand-in of the same kind.
            const text = vars.get(name) ?? name;
            buf += q === "'" ? `'${text.replaceAll("'", "''")}'` : `"${text.replaceAll('"', '""')}"`;
            i += all.length;
            continue;
          }
          if (bare && typeof vars.get(name) === "string") {
            buf += vars.get(name);
            if (vars.get(name).includes(";")) substitutedSemicolon = true;
            i += all.length;
            continue;
          }
          if (test || (bare && known(name)) || (bare && gset && bracketDepth === 0)) psqlVars = true;
        }
      }
      if (c === "(") parenDepth++;
      if (c === ")" && parenDepth > 0) parenDepth--;
      if (c === "[") bracketDepth++;
      if (c === "]" && bracketDepth > 0) bracketDepth--;
      if (IDENT_START.test(c) && !IDENT_CONT.test(buf.slice(-1))) {
        const word = WORD.exec(line.slice(i))[0];
        if (parenDepth === 0) trackIdent(word.toLowerCase());
        buf += word; i += word.length;
        continue;
      }
      if (c === ";" && parenDepth === 0 && beginDepth === 0) {
        buf += ";"; i++;
        flush(ln);
        continue;
      }
      buf += c; i++;
    }
    buf += "\n";
  }
  flush(lines.length - 1);
  return out;

  /** `\set name [value ...]`: plain words and '...' quoted values are kept; anything else is unknown. */
  function setVar(args) {
    const m = /^\s*([A-Za-z0-9_]+)\s*(.*)$/.exec(args);
    if (!m) return;
    const [, name, rest] = m;
    const value = rest.trim();
    if (options.env) return void vars.set(name, concatenated(value));
    if (/^[^'"`\s\\:]*$/.test(value)) vars.set(name, value);
    else if (/^'([^'\\]|'')*'$/.test(value)) vars.set(name, value.slice(1, -1).replaceAll("''", "'"));
    else vars.set(name, null);
  }

  function concatenated(value) {
    let out = "";
    for (const m of value.matchAll(/:([A-Za-z0-9_]+)|'((?:[^'\\]|'')*)'|([^\s'":\\]+)|(\S)/g)) {
      if (m[1] !== undefined) {
        const v = vars.get(m[1]);
        if (typeof v !== "string") return null;
        out += v;
      } else if (m[2] !== undefined) out += m[2].replaceAll("''", "'");
      else if (m[3] !== undefined) out += m[3];
      else return null;
    }
    return out;
  }

  /** `\if expr`, `\elif expr`, `\else`, `\endif`. Only literal booleans are evaluated. */
  function branch(cmd, arg) {
    const value = () => {
      const v = arg.trim().toLowerCase();
      return /^(t|tr|tru|true|y|ye|yes|on|1)$/.test(v) ? true : /^(f|fa|fal|fals|false|n|no|off|0)$/.test(v) ? false : null;
    };
    if (cmd === "if") { const v = value(); ifs.push({ active: v, taken: v }); return; }
    const b = ifs.at(-1);
    if (!b) return;
    if (cmd === "endif") { ifs.pop(); return; }
    // An earlier branch ran: this one does not. Unknown earlier branches make this one unknown.
    const v = cmd === "else" ? true : value();
    b.active = b.taken === true ? false : b.taken === null ? (v === false ? false : null) : v;
    if (b.active !== false) b.taken = b.taken === null || b.active === null ? null : true;
  }

  /** psql counts BEGIN/CASE/END inside CREATE [OR REPLACE] FUNCTION|PROCEDURE (BEGIN ATOMIC bodies). */
  function trackIdent(word) {
    if (initIdents.length < 8) initIdents.push(word);
    const [a, b, c, d] = initIdents;
    const routine = a === "create" && (b === "function" || b === "procedure" || (b === "or" && c === "replace" && (d === "function" || d === "procedure")));
    if (!routine) return;
    if (word === "begin") beginDepth++;
    else if (word === "case" && beginDepth > 0) beginDepth++;
    else if (word === "end" && beginDepth > 0) beginDepth--;
  }

  /** COPY, then FROM STDIN or FROM STDOUT within the first words (the grammar treats both as stdin). */
  function isCopyFromStdin() {
    if (initIdents[0] !== "copy") return false;
    const from = initIdents.indexOf("from", 1);
    return from > 0 && from < 7 && (initIdents[from + 1] === "stdin" || initIdents[from + 1] === "stdout");
  }
}

/**
 * Split `sqlText` and set `pg` on each statement from `outText`, the expected output of
 * `psql -a`. psql echoes every input line except blank lines and COPY data, and prints a
 * statement's result after the line the statement ends on. A statement whose surrounding lines
 * cannot be found in the output, that shares its last line with other statements when a syntax
 * error is reported after it, or that sits in an `\if` branch we cannot evaluate, is `unknown`.
 * @param {string} sqlText
 * @param {string} outText
 * @param {SplitOptions} [options]
 * @returns {Statement[]}
 */
export function classify(sqlText, outText, options = {}) {
  const stmts = splitPsql(sqlText, options);
  const inLines = sqlText.split("\n");
  const outLines = outText.split("\n");
  const echoed = (i) => inLines[i].trim() !== "" && !stmts.dataLines.has(i);
  /** Output line of each echoed input line, or -1. */
  const pos = new Array(inLines.length).fill(-1);
  for (let i = 0, cur = 0; i < inLines.length; i++) {
    if (!echoed(i)) continue;
    let j = cur;
    while (j < outLines.length && outLines[j] !== inLines[i]) j++;
    if (j < outLines.length) { pos[i] = j; cur = j + 1; }
  }
  const endingOn = new Map();
  for (const s of stmts) endingOn.set(s.endLine, (endingOn.get(s.endLine) ?? 0) + 1);
  for (const s of stmts) {
    const last = s.endLine - 1;
    let next = last + 1;
    while (next < inLines.length && !echoed(next)) next++;
    const from = pos[last];
    const to = next < inLines.length ? pos[next] : outLines.length;
    if (s.conditional || from < 0 || to < 0) { s.pg = "unknown"; continue; }
    const region = outLines.slice(from + 1, to);
    const at = region.findIndex((l) => /^(ERROR|FATAL|PANIC):/.test(l));
    if (at < 0) { s.pg = "ok"; continue; }
    s.pgError = region[at];
    if (endingOn.get(s.endLine) > 1) {
      // Several statements end on this line and share the output. Without a grammar error among
      // the errors, every one of them was parsed (a `\;` group is parsed as a whole first).
      const grammar = region.some((l, k) => /^(ERROR|FATAL|PANIC):/.test(l) && isGrammarError(region.slice(k)));
      s.pg = grammar ? "unknown" : "error";
      continue;
    }
    s.pg = isGrammarError(region.slice(at)) && !inQuotedText(s.sql, region.slice(at)) ? "syntax-error" : "error";
  }
  return stmts;
}

/**
 * The raw parser's error: `syntax error at or near "…"` or `at end of input`, with no
 * CONTEXT line. Input functions (jsonpath, tsvector, regtype, …) word their errors differently
 * or add a CONTEXT line. Syntax errors in a SQL function body look exactly like the parser's
 * and stay in.
 * @param {string[]} lines the error line and what follows it
 */
function isGrammarError(lines) {
  // The scanner's and the grammar's errors end in `at or near "…"` / `at end of input` (other
  // errors point at a position with a LINE line only); with terse verbosity, `at character N`.
  // Unicode escapes are decoded between the scanner and the grammar.
  const raw = /^ERROR:  .* at (or near ".*"|end of input)( at character \d+)?$/.test(lines[0]) && !/ of jsonpath input/.test(lines[0]);
  const unicode = /^ERROR:  (unsafe use of string constant with Unicode escapes|invalid Unicode escape( value)?|invalid Unicode surrogate pair)( at character \d+)?$/.test(lines[0]) && /^LINE \d+: /.test(lines[1] ?? "");
  if (!raw && !unicode) return false;
  const next = lines.slice(1).findIndex((l) => /^(ERROR|WARNING|NOTICE|INFO):/.test(l));
  return !lines.slice(1, next < 0 ? undefined : next + 1).some((l) => l.startsWith("CONTEXT:"));
}

/**
 * Does the error's caret (`LINE n: …` and the `^` line under it) point into a quoted string of
 * the statement? Then the syntax error is in a function body Postgres parsed while running
 * CREATE FUNCTION / DO, not in the statement. Unknown positions count as outside.
 * @param {string} sql
 * @param {string[]} lines the error line and what follows it
 */
function inQuotedText(sql, lines) {
  const at = lines.findIndex((l) => /^LINE \d+: /.test(l));
  if (at < 0 || !lines[at + 1]?.includes("^")) return false;
  const [, n, excerpt] = /^LINE (\d+): (.*)$/.exec(lines[at]);
  const caret = lines[at + 1].indexOf("^") - `LINE ${n}: `.length;
  const sqlLines = sql.split("\n");
  const line = sqlLines[Number(n) - 1];
  if (line === undefined) return false;
  // Long lines are shown as a window with "..." on either side.
  const lead = excerpt.startsWith("...") ? 3 : 0;
  const core = excerpt.slice(lead).replace(/\.\.\.$/, "");
  const start = line.indexOf(core);
  if (start < 0) return false;
  const offset = sqlLines.slice(0, Number(n) - 1).reduce((a, l) => a + l.length + 1, 0) + start + caret - lead;
  return quotedSpans(sql).some(([from, to]) => offset > from && offset < to);
}

/** `[start, end]` offsets of the string literals and dollar-quoted strings in `sql`. */
function quotedSpans(sql) {
  const spans = [];
  for (let i = 0; i < sql.length; ) {
    if (sql.startsWith("--", i)) { const e = sql.indexOf("\n", i); i = e < 0 ? sql.length : e; continue; }
    if (sql.startsWith("/*", i)) { const e = sql.indexOf("*/", i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    if (sql[i] === '"') { const e = sql.indexOf('"', i + 1); i = e < 0 ? sql.length : e + 1; continue; }
    const dollar = DOLLAR_QUOTE.exec(sql.slice(i));
    if (dollar && !IDENT_CONT.test(sql[i - 1] ?? "")) {
      const e = sql.indexOf(dollar[0], i + dollar[0].length);
      const end = e < 0 ? sql.length : e + dollar[0].length;
      spans.push([i, end - 1]);
      i = end;
      continue;
    }
    if (sql[i] === "'") {
      const escapes = /[eE]/.test(sql[i - 1] ?? "") && !IDENT_CONT.test(sql[i - 2] ?? "");
      let j = i + 1;
      for (; j < sql.length; j++) {
        if (escapes && sql[j] === "\\") { j++; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j++; continue; } break; }
      }
      spans.push([i, j]);
      i = j + 1;
      continue;
    }
    i++;
  }
  return spans;
}
