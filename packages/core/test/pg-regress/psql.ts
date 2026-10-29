const PSQL_VARIABLES = new Set([
	"AUTOCOMMIT",
	"DBNAME",
	"ENCODING",
	"ERROR",
	"HOST",
	"LASTOID",
	"LAST_ERROR_MESSAGE",
	"LAST_ERROR_SQLSTATE",
	"PORT",
	"ROW_COUNT",
	"SERVER_VERSION_NAME",
	"SERVER_VERSION_NUM",
	"SHELL_ERROR",
	"SHELL_EXIT_CODE",
	"SQLSTATE",
	"USER",
	"VERSION",
	"VERSION_NAME",
	"VERSION_NUM",
	"PIPELINE_SYNC_COUNT",
	"PIPELINE_COMMAND_COUNT",
	"PIPELINE_RESULT_COUNT",
]);

const SENDS = new Set([
	"g",
	"gx",
	"gset",
	"gexec",
	"gdesc",
	"crosstabview",
	"watch",
	"sendpipeline",
	"parse",
]);
const IDENT_START = /[A-Za-z_]|\P{ASCII}/u;
const IDENT_CONT = /[A-Za-z0-9_$]|\P{ASCII}/u;
const WORD = /^(?:[A-Za-z_]|\P{ASCII})(?:[A-Za-z0-9_$]|\P{ASCII})*/u;
const DOLLAR_QUOTE =
	/^\$(?:(?:[A-Za-z_]|\P{ASCII})(?:[A-Za-z0-9_]|\P{ASCII})*)?\$/u;

export interface Statement {
	sql: string;
	line: number;
	endLine: number;
	psqlVars: boolean;
	conditional: boolean;
	nonstandardStrings: boolean;
	pg?: "ok" | "error" | "syntax-error" | "unknown";
	pgError?: string;
	copyData?: string;
}

export interface SplitOptions {
	env?: Record<string, string>;
}

export function splitPsql(
	text: string,
	options: SplitOptions = {},
): Statement[] & { dataLines: Set<number> } {
	const lines = text.split("\n");
	const out = Object.assign<Statement[], { dataLines: Set<number> }>([], {
		dataLines: new Set(),
	});
	let buf = "";
	let startLine = -1;
	let startIdx = 0;
	let parenDepth = 0;
	let bracketDepth = 0;
	let beginDepth = 0;
	let initIdents: string[] = [];
	let psqlVars = false;
	let substitutedSemicolon = false;
	const vars = new Map<string, string | null>();
	let gset = false;
	const known = (name: string): boolean =>
		vars.has(name) || PSQL_VARIABLES.has(name);
	const maybeDefined = (name: string): boolean => known(name) || gset;
	const ifs: { active: boolean | null; taken: boolean | null }[] = [];
	const running = () => ifs.every((b) => b.active !== false);
	const conditional = () => ifs.some((b) => b.active === null);
	let copyBlocks = 0;
	const copying: (Statement | undefined)[] = [];
	let stdStrings = true;
	let commentDepth = 0;
	let quote: null | string = null;

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

	const flush = (endLine: number): void => {
		const sql = buf.slice(startIdx).trim();
		if (startLine >= 0 && sql !== ";") {
			const parts = substitutedSemicolon
				? splitPsql(sql).map((p) => p.sql)
				: [sql];
			for (const part of parts)
				out.push({
					sql: part,
					line: startLine + 1,
					endLine: endLine + 1,
					psqlVars,
					conditional: conditional(),
					nonstandardStrings: !stdStrings && part.includes("\\"),
				});
			if (isCopyFromStdin()) {
				copyBlocks++;
				copying.push(out.at(-1));
			}
			const words = sql
				.replace(/--[^\n]*/g, "")
				.toLowerCase()
				.split(/[\s=]+/)
				.filter(Boolean);
			if (
				(words[0] === "set" || words[0] === "reset") &&
				words.includes("standard_conforming_strings")
			) {
				stdStrings =
					words[0] === "reset" ||
					!/\b(off|false)\b/.test(words.slice(2).join(" "));
			}
		}
		reset();
	};

	for (let ln = 0; ln < lines.length; ln++) {
		const line = lines[ln]!;
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
			if (!running() && !quote && !commentDepth && line[i] !== "\\") {
				const k = line.indexOf("\\", i);
				if (k < 0) break;
				i = k;
			}
			const c = line[i]!;
			if (commentDepth) {
				if (line.startsWith("*/", i)) {
					commentDepth--;
					buf += "*/";
					i += 2;
				} else if (line.startsWith("/*", i)) {
					commentDepth++;
					buf += "/*";
					i += 2;
				} else {
					buf += c;
					i++;
				}
				continue;
			}
			if (quote === "'" || quote === "e'" || quote === "raw'") {
				if (c === "\\" && (quote === "e'" || (quote === "'" && !stdStrings))) {
					buf += line.slice(i, i + 2);
					i += 2;
					continue;
				}
				if (c === "'" && line[i + 1] === "'") {
					buf += "''";
					i += 2;
					continue;
				}
				if (c === "'") quote = null;
				buf += c;
				i++;
				continue;
			}
			if (quote === '"') {
				if (c === '"' && line[i + 1] === '"') {
					buf += '""';
					i += 2;
					continue;
				}
				if (c === '"') quote = null;
				buf += c;
				i++;
				continue;
			}
			if (quote) {
				if (line.startsWith(quote, i)) {
					buf += quote;
					i += quote.length;
					quote = null;
				} else {
					buf += c;
					i++;
				}
				continue;
			}
			if (/\s/.test(c)) {
				buf += c;
				i++;
				continue;
			}
			if (line.startsWith("--", i)) {
				buf += line.slice(i);
				break;
			}
			if (line.startsWith("/*", i)) {
				commentDepth = 1;
				buf += "/*";
				i += 2;
				continue;
			}
			if (c === "\\") {
				if (line[i + 1] === ";") {
					buf += ";";
					i += 2;
					if (parenDepth === 0 && beginDepth === 0) flush(ln);
					continue;
				}
				if (line[i + 1] === ":") {
					buf += ":";
					i += 2;
					continue;
				}
				if (line[i + 1] === "\\") {
					i += 2;
					continue;
				}
				const cmd = /^\\([A-Za-z_?!.]*)/.exec(line.slice(i))![1]!;
				let end = i + 1 + cmd.length;
				for (
					let q = false;
					end < line.length && (q || line[end] !== "\\");
					end++
				)
					if (line[end] === "'") q = !q;
				const args = line.slice(i + 1 + cmd.length, end);
				if (cmd === "if" || cmd === "elif" || cmd === "else" || cmd === "endif")
					branch(cmd, args);
				else if (!running()) {
				} else if (cmd === "set") setVar(args);
				else if (cmd === "unset") vars.delete(args.trim());
				else if (cmd === "getenv") {
					const [name, from] = args.trim().split(/\s+/);
					vars.set(
						name!,
						options.env ? (options.env[from ?? ""] ?? null) : null,
					);
				} else if (cmd === "gset") gset = true;
				else if (cmd === "r" || cmd === "reset") reset();
				else if (cmd === "copy" && /\bfrom\s+p?stdin\b/i.test(args))
					copyBlocks++;
				if (SENDS.has(cmd) && running()) flush(ln);
				i = end;
				continue;
			}
			if (startLine < 0) {
				startLine = ln;
				startIdx = buf.length;
			}
			if (c === "'") {
				const prev = buf.slice(-1);
				const prefixed = (p: RegExp): boolean =>
					p.test(prev) && !IDENT_CONT.test(buf.slice(-2, -1));
				quote = prefixed(/[eE]/)
					? "e'"
					: prefixed(/[bBxX]/) ||
							(prev === "&" && /(^|[^A-Za-z0-9_$])[uU]&$/.test(buf.slice(-3)))
						? "raw'"
						: "'";
				buf += c;
				i++;
				continue;
			}
			if (c === '"') {
				quote = '"';
				buf += c;
				i++;
				continue;
			}
			if (c === "$") {
				const m = DOLLAR_QUOTE.exec(line.slice(i));
				if (m && !IDENT_CONT.test(buf.slice(-1))) {
					quote = m[0];
					buf += m[0];
					i += m[0].length;
					continue;
				}
				buf += c;
				i++;
				continue;
			}
			if (c === ":" && line[i + 1] !== ":" && buf.slice(-1) !== ":") {
				const v =
					/^:(?:(['"])([A-Za-z0-9_]+)\1|([A-Za-z0-9_]+)|\{\?([A-Za-z0-9_]+)\})/.exec(
						line.slice(i),
					);
				if (v) {
					const [all, q, qname, bare, test] = v;
					const name = (qname ?? bare ?? test)!;
					if (q && maybeDefined(name)) {
						const text = vars.get(name) ?? name;
						buf +=
							q === "'"
								? `'${text.replaceAll("'", "''")}'`
								: `"${text.replaceAll('"', '""')}"`;
						i += all.length;
						continue;
					}
					if (bare && typeof vars.get(name) === "string") {
						buf += vars.get(name);
						if (vars.get(name)!.includes(";")) substitutedSemicolon = true;
						i += all.length;
						continue;
					}
					if (
						test ||
						(bare && known(name)) ||
						(bare && gset && bracketDepth === 0)
					)
						psqlVars = true;
				}
			}
			if (c === "(") parenDepth++;
			if (c === ")" && parenDepth > 0) parenDepth--;
			if (c === "[") bracketDepth++;
			if (c === "]" && bracketDepth > 0) bracketDepth--;
			if (IDENT_START.test(c) && !IDENT_CONT.test(buf.slice(-1))) {
				const word = WORD.exec(line.slice(i))![0];
				if (parenDepth === 0) trackIdent(word.toLowerCase());
				buf += word;
				i += word.length;
				continue;
			}
			if (c === ";" && parenDepth === 0 && beginDepth === 0) {
				buf += ";";
				i++;
				flush(ln);
				continue;
			}
			buf += c;
			i++;
		}
		buf += "\n";
	}
	flush(lines.length - 1);
	return out;

	function setVar(args: string): void {
		const m = /^\s*([A-Za-z0-9_]+)\s*(.*)$/.exec(args);
		if (!m) return;
		const [, name, rest] = m as RegExpExecArray & [string, string, string];
		const value = rest.trim();
		if (options.env) return void vars.set(name, concatenated(value));
		if (/^[^'"`\s\\:]*$/.test(value)) vars.set(name, value);
		else if (/^'([^'\\]|'')*'$/.test(value))
			vars.set(name, value.slice(1, -1).replaceAll("''", "'"));
		else vars.set(name, null);
	}

	function concatenated(value: string): string | null {
		let out = "";
		for (const m of value.matchAll(
			/:([A-Za-z0-9_]+)|'((?:[^'\\]|'')*)'|([^\s'":\\]+)|(\S)/g,
		)) {
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

	function branch(cmd: string, arg: string): void {
		const value = () => {
			const v = arg.trim().toLowerCase();
			return /^(t|tr|tru|true|y|ye|yes|on|1)$/.test(v)
				? true
				: /^(f|fa|fal|fals|false|n|no|off|0)$/.test(v)
					? false
					: null;
		};
		if (cmd === "if") {
			const v = value();
			ifs.push({ active: v, taken: v });
			return;
		}
		const b = ifs.at(-1);
		if (!b) return;
		if (cmd === "endif") {
			ifs.pop();
			return;
		}
		const v = cmd === "else" ? true : value();
		b.active =
			b.taken === true
				? false
				: b.taken === null
					? v === false
						? false
						: null
					: v;
		if (b.active !== false)
			b.taken = b.taken === null || b.active === null ? null : true;
	}

	function trackIdent(word: string): void {
		if (initIdents.length < 8) initIdents.push(word);
		const [a, b, c, d] = initIdents;
		const routine =
			a === "create" &&
			(b === "function" ||
				b === "procedure" ||
				(b === "or" &&
					c === "replace" &&
					(d === "function" || d === "procedure")));
		if (!routine) return;
		if (word === "begin") beginDepth++;
		else if (word === "case" && beginDepth > 0) beginDepth++;
		else if (word === "end" && beginDepth > 0) beginDepth--;
	}

	function isCopyFromStdin(): boolean {
		if (initIdents[0] !== "copy") return false;
		const from = initIdents.indexOf("from", 1);
		return (
			from > 0 &&
			from < 7 &&
			(initIdents[from + 1] === "stdin" || initIdents[from + 1] === "stdout")
		);
	}
}

export function classify(
	sqlText: string,
	outText: string,
	options: SplitOptions = {},
): Statement[] {
	const stmts = splitPsql(sqlText, options);
	const inLines = sqlText.split("\n");
	const outLines = outText.split("\n");
	const echoed = (i: number): boolean =>
		inLines[i]!.trim() !== "" && !stmts.dataLines.has(i);
	const pos = new Array<number>(inLines.length).fill(-1);
	for (let i = 0, cur = 0; i < inLines.length; i++) {
		if (!echoed(i)) continue;
		let j = cur;
		while (j < outLines.length && outLines[j] !== inLines[i]) j++;
		if (j < outLines.length) {
			pos[i] = j;
			cur = j + 1;
		}
	}
	const endingOn = new Map<number, number>();
	for (const s of stmts)
		endingOn.set(s.endLine, (endingOn.get(s.endLine) ?? 0) + 1);
	for (const s of stmts) {
		const last = s.endLine - 1;
		let next = last + 1;
		while (next < inLines.length && !echoed(next)) next++;
		const from = pos[last]!;
		const to = next < inLines.length ? pos[next]! : outLines.length;
		if (s.conditional || from < 0 || to < 0) {
			s.pg = "unknown";
			continue;
		}
		const region = outLines.slice(from + 1, to);
		const at = region.findIndex((l) => /^(ERROR|FATAL|PANIC):/.test(l));
		if (at < 0) {
			s.pg = "ok";
			continue;
		}
		s.pgError = region[at]!;
		if (endingOn.get(s.endLine)! > 1) {
			const grammar = region.some(
				(l, k) =>
					/^(ERROR|FATAL|PANIC):/.test(l) && isGrammarError(region.slice(k)),
			);
			s.pg = grammar ? "unknown" : "error";
			continue;
		}
		s.pg =
			isGrammarError(region.slice(at)) && !inQuotedText(s.sql, region.slice(at))
				? "syntax-error"
				: "error";
	}
	return stmts;
}

function isGrammarError(lines: string[]): boolean {
	const raw =
		/^ERROR: {2}.* at (or near ".*"|end of input)( at character \d+)?$/.test(
			lines[0]!,
		) && !/ of jsonpath input/.test(lines[0]!);
	const unicode =
		/^ERROR: {2}(unsafe use of string constant with Unicode escapes|invalid Unicode escape( value)?|invalid Unicode surrogate pair)( at character \d+)?$/.test(
			lines[0]!,
		) && /^LINE \d+: /.test(lines[1] ?? "");
	if (!raw && !unicode) return false;
	const next = lines
		.slice(1)
		.findIndex((l) => /^(ERROR|WARNING|NOTICE|INFO):/.test(l));
	return !lines
		.slice(1, next < 0 ? undefined : next + 1)
		.some((l) => l.startsWith("CONTEXT:"));
}

function inQuotedText(sql: string, lines: string[]): boolean {
	const at = lines.findIndex((l) => /^LINE \d+: /.test(l));
	if (at < 0 || !lines[at + 1]?.includes("^")) return false;
	const [, n, excerpt] = /^LINE (\d+): (.*)$/.exec(
		lines[at]!,
	)! as RegExpExecArray & [string, string, string];
	const caret = lines[at + 1]!.indexOf("^") - `LINE ${n}: `.length;
	const sqlLines = sql.split("\n");
	const line = sqlLines[Number(n) - 1];
	if (line === undefined) return false;
	const lead = excerpt.startsWith("...") ? 3 : 0;
	const core = excerpt.slice(lead).replace(/\.\.\.$/, "");
	const start = line.indexOf(core);
	if (start < 0) return false;
	const offset =
		sqlLines.slice(0, Number(n) - 1).reduce((a, l) => a + l.length + 1, 0) +
		start +
		caret -
		lead;
	return quotedSpans(sql).some(([from, to]) => offset > from && offset < to);
}

function quotedSpans(sql: string): [number, number][] {
	const spans: [number, number][] = [];
	for (let i = 0; i < sql.length; ) {
		if (sql.startsWith("--", i)) {
			const e = sql.indexOf("\n", i);
			i = e < 0 ? sql.length : e;
			continue;
		}
		if (sql.startsWith("/*", i)) {
			const e = sql.indexOf("*/", i + 2);
			i = e < 0 ? sql.length : e + 2;
			continue;
		}
		if (sql[i] === '"') {
			const e = sql.indexOf('"', i + 1);
			i = e < 0 ? sql.length : e + 1;
			continue;
		}
		const dollar = DOLLAR_QUOTE.exec(sql.slice(i));
		if (dollar && !IDENT_CONT.test(sql[i - 1] ?? "")) {
			const e = sql.indexOf(dollar[0], i + dollar[0].length);
			const end = e < 0 ? sql.length : e + dollar[0].length;
			spans.push([i, end - 1]);
			i = end;
			continue;
		}
		if (sql[i] === "'") {
			const escapes =
				/[eE]/.test(sql[i - 1] ?? "") && !IDENT_CONT.test(sql[i - 2] ?? "");
			let j = i + 1;
			for (; j < sql.length; j++) {
				if (escapes && sql[j] === "\\") {
					j++;
					continue;
				}
				if (sql[j] === "'") {
					if (sql[j + 1] === "'") {
						j++;
						continue;
					}
					break;
				}
			}
			spans.push([i, j]);
			i = j + 1;
			continue;
		}
		i++;
	}
	return spans;
}
