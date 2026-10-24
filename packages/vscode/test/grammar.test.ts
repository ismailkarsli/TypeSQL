/**
 * The SQL injection grammar, tokenized the way VS Code does: vscode-textmate with Oniguruma, on
 * VS Code's own TypeScript and JavaScript grammars (from tm-grammars), with the injection,
 * `injectTo` and `tokenTypes` of package.json.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";

const root = path.join(__dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  contributes: { grammars: { scopeName: string; path: string; injectTo: string[]; tokenTypes: Record<string, string> }[] };
};
const contribution = pkg.contributes.grammars[0]!;
const files: Record<string, string> = {
  "source.ts": require.resolve("tm-grammars/grammars/typescript.json"),
  "source.js": require.resolve("tm-grammars/grammars/javascript.json"),
  [contribution.scopeName]: path.join(root, contribution.path),
};

let ts: IGrammar;
let js: IGrammar;
beforeAll(async () => {
  await loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer);
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner: (s) => new OnigScanner(s), createOnigString: (s) => new OnigString(s) }),
    loadGrammar: async (scope) => (files[scope] ? parseRawGrammar(readFileSync(files[scope], "utf8"), files[scope]) : null),
    getInjections: (scope) => (contribution.injectTo.includes(scope) ? [contribution.scopeName] : undefined),
  });
  const types: Record<string, number> = { other: 0, comment: 1, string: 2 };
  const tokenTypes = Object.fromEntries(Object.entries(contribution.tokenTypes).map(([k, v]) => [k, types[v]!]));
  ts = (await registry.loadGrammarWithConfiguration("source.ts", 1, { tokenTypes }))!;
  js = (await registry.loadGrammarWithConfiguration("source.js", 1, { tokenTypes }))!;
});

interface Token {
  text: string;
  scopes: string[];
  type: "other" | "comment" | "string";
}

function tokenize(code: string, grammar: IGrammar = ts): Token[] {
  const out: Token[] = [];
  let stack = INITIAL;
  for (const line of code.split("\n")) {
    const scoped = grammar.tokenizeLine(line, stack);
    const typed = grammar.tokenizeLine2(line, stack).tokens;
    stack = scoped.ruleStack;
    for (const t of scoped.tokens) {
      let k = 0;
      while (k + 2 < typed.length && typed[k + 2]! <= t.startIndex) k += 2;
      const type = (["other", "comment", "string"] as const)[(typed[k + 1]! >>> 8) & 3]!;
      out.push({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes, type });
    }
  }
  return out;
}

/** The innermost scope of the `nth` token whose text is `text`. */
function scope(code: string, text: string, nth = 0, grammar?: IGrammar): string {
  const t = tokenize(code, grammar).filter((t) => t.text === text)[nth];
  if (!t) throw new Error(`no token ${JSON.stringify(text)} in ${code}`);
  return t.scopes.at(-1)!;
}

const hasSql = (code: string): boolean => tokenize(code).some((t) => t.scopes.some((s) => s.endsWith(".sql")));

test.each([
  ['sql("SELECT id FROM users WHERE id = $1", 7);', "SELECT"],
  ["sql('SELECT id FROM users');", "SELECT"],
  ["sql(`SELECT id FROM users`);", "SELECT"],
  ['tx("UPDATE posts SET title = $1", "x");', "UPDATE"],
  ['sql.fragment("AND p.author_id = $1", 7);', "AND"],
  ['sql.as<{ n: number }>("SELECT count(*) AS n FROM users");', "SELECT"],
  ['db.sql("SELECT 1");', "SELECT"],
  ['pgSql("SELECT 1");', "SELECT"],
  ['admin(/* sql */ "SELECT 1");', "SELECT"],
  ['const text = /* sql */ "SELECT 1";', "SELECT"],
  ["sql(\n  `SELECT id\n   FROM users`,\n  7,\n);", "FROM"],
])("%s highlights SQL", (code, keyword) => {
  expect(scope(code, keyword)).toBe("keyword.other.sql");
});

test.each([
  ['f("SELECT 1");', "SELECT 1"],
  ['const s = "SELECT 1";', "SELECT 1"],
  ['sql.param("SELECT 1");', "SELECT 1"],
  ['sql.id("SELECT 1");', "SELECT 1"],
  ['mysqlish("SELECT 1");', "SELECT 1"],
  ['sql("x", "SELECT 1");', "SELECT 1"],
  ['sql(query, "SELECT 1");', "SELECT 1"],
])("%s leaves other strings alone", (code, text) => {
  expect(scope(code, text)).toMatch(/^string\.quoted\./);
});

test("SQL tokens", () => {
  const code = "sql(`SELECT u.id::text, 'it''s', \"Name\", $1, :name, count(*) FROM users u {where} -- note\n/* block */ WHERE x = 1.5 AND $$a$$`)";
  expect(scope(code, "::")).toBe("keyword.operator.cast.sql");
  expect(scope(code, "text")).toBe("storage.type.sql");
  expect(scope(code, "''")).toBe("constant.character.escape.sql");
  expect(scope(code, "Name")).toBe("meta.identifier.quoted.sql");
  expect(scope(code, "$1")).toBe("variable.parameter.positional.sql");
  expect(scope(code, "name")).toBe("variable.parameter.named.sql");
  expect(scope(code, "count")).toBe("entity.name.function.sql");
  expect(scope(code, "where")).toBe("variable.other.slot.sql");
  expect(scope(code, " note")).toBe("comment.line.double-dash.sql");
  expect(scope(code, " block ")).toBe("comment.block.sql");
  expect(scope(code, "1.5")).toBe("constant.numeric.sql");
  expect(scope(code, "a")).toBe("string.quoted.other.dollar.sql");
  expect(scope(code, "users")).toBe("meta.embedded.block.sql");
});

test("template substitutions are TypeScript, and a sql() inside one is highlighted", () => {
  const code = "sql(`SELECT id FROM users WHERE id = ${sql.param(id)} AND ${sql.fragment(`true`)}`);";
  expect(scope(code, "param")).toBe("entity.name.function.ts");
  expect(scope(code, "id", 2)).toBe("variable.other.readwrite.ts");
  expect(scope(code, "true")).toBe("constant.language.sql");
});

test("a host string's closing quote ends unterminated SQL strings, comments and identifiers", () => {
  for (const code of [
    `sql("SELECT 'oops"); const after = 1;`,
    `sql("SELECT 1 -- note"); const after = 1;`,
    `sql("SELECT 1 /* note"); const after = 1;`,
    `sql("SELECT $$ note"); const after = 1;`,
    `sql('SELECT "oops'); const after = 1;`,
    "sql(`SELECT 'oops`); const after = 1;",
    "sql(`SELECT 1 -- note`); const after = 1;",
  ]) {
    expect(scope(code, "after"), code).toBe("variable.other.constant.ts");
  }
});

test("an escaped quote in an SQL comment does not end the host string", () => {
  for (const code of [
    String.raw`sql("SELECT /* \"x\" */ 1"); const after = 1;`,
    String.raw`sql("SELECT 1 -- \"x\""); const after = 1;`,
    String.raw`sql('SELECT /* \'x\' */ 1'); const after = 1;`,
    "sql(`SELECT /* \\` */ 1`);\nconst after = 1;",
    "sql(`SELECT 1 -- \\`\nFROM t`);\nconst after = 1;",
  ]) {
    expect(scope(code, "after"), code).toBe("variable.other.constant.ts");
  }
});

test("a substitution in an SQL comment is TypeScript", () => {
  for (const code of ["sql(`SELECT 1 -- ${sql.fragment(`a`)}\nFROM t`);\nconst after = 1;", "sql(`SELECT 1 /* ${sql.fragment(`a`)} */ FROM t`);\nconst after = 1;"]) {
    expect(scope(code, "fragment"), code).toBe("entity.name.function.ts");
    expect(scope(code, "FROM"), code).toBe("keyword.other.sql");
    expect(scope(code, "after"), code).toBe("variable.other.constant.ts");
  }
});

test("a line continuation keeps the SQL going", () => {
  const code = 'sql("SELECT \\\nid, \'a \\\nb\' /* c \\\nd */ -- e \\\nf");\nconst after = 1;';
  expect(scope(code, "id")).toBe("meta.embedded.line.sql");
  expect(scope(code, "b")).toBe("string.quoted.single.sql");
  expect(scope(code, "d ")).toBe("comment.block.sql");
  expect(scope(code, "f")).toBe("comment.line.double-dash.sql");
  expect(scope(code, "after")).toBe("variable.other.constant.ts");
});

test("method declarations named like sql stay TypeScript", () => {
  for (const code of ["class A {\n  runSql(query: string): void {}\n}", "interface Db {\n  sql(query: string): Promise<void>;\n}", "const o = { tx(query: string) {} };"]) {
    expect(scope(code, "query"), code).toBe("variable.parameter.ts");
    expect(scope(code, "string"), code).toBe("support.type.primitive.ts");
  }
});

test("an unclosed call reads on like TypeScript's own", () => {
  expect(scope('sql("SELECT 1\nconst after = 1;', "after")).toBe(scope('f("SELECT 1\nconst after = 1;', "after"));
});

test("escaped quotes", () => {
  expect(scope(String.raw`sql("SELECT \"Name\" FROM t")`, "Name")).toBe("meta.identifier.quoted.sql");
  expect(scope(String.raw`sql('SELECT \'it\' FROM t')`, "it")).toBe("string.quoted.single.sql");
});

test("the rest of the call and the code after it are TypeScript", () => {
  const code = 'const q = sql("SELECT $1", fn(1, 2), "x");\nconst n = 1;';
  expect(scope(code, "fn")).toBe("entity.name.function.ts");
  expect(scope(code, "x")).toBe("string.quoted.double.ts");
  expect(scope(code, ")", 1)).toBe("meta.brace.round.ts");
  expect(scope(code, "n")).toBe("variable.other.constant.ts");
  expect(scope(code, "1", 1)).toBe("constant.numeric.decimal.ts");
});

test("SQL text keeps the string token type, comments and substitutions keep theirs", () => {
  const tokens = tokenize("sql(`SELECT id -- c\n FROM t WHERE id = ${sql.param(id)}`)");
  const type = (text: string): string => tokens.find((t) => t.text === text)!.type;
  expect(type("SELECT")).toBe("string");
  expect(type("t")).toBe("string");
  expect(type(" c")).toBe("comment");
  expect(type("param")).toBe("other");
});

test("JavaScript", () => {
  expect(scope('sql("SELECT 1");', "SELECT", 0, js)).toBe("keyword.other.sql");
});

test("not inside comments or strings", () => {
  expect(hasSql('// sql("SELECT 1")')).toBe(false);
  expect(hasSql("/* sql(`SELECT 1`) */")).toBe(false);
  expect(hasSql('const s = "sql(\'SELECT 1\')";')).toBe(false);
});
