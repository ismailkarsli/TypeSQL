import { expect, test } from "vitest";
import { contextAt, fold, type ScopeItem } from "../../src/complete/scan.js";

/**
 * The scanner's tokens, seen through the context at `|` (the same short form as
 * scan.test.ts): `none`, `relation [schema]`, `columns <sources> [| aliases]`.
 */
function at(marked: string): string {
	const offset = marked.indexOf("|");
	const text = marked.slice(0, offset) + marked.slice(offset + 1);
	const { expect: e, from } = contextAt(text, offset);
	const word = text.slice(from, offset);
	const typed = word ? ` (${word})` : "";
	if (e.kind === "none") return "none";
	if (e.kind === "relation")
		return `relation${e.schema === null ? "" : ` ${e.schema}`}${typed}`;
	const src = (s: ScopeItem): string =>
		s.rel
			? `${s.rel.schema === null ? "" : `${s.rel.schema}.`}${s.rel.name}${s.name === s.rel.name ? "" : ` ${s.name}`}`
			: `${s.name || "?"}(${s.columns?.join(",") ?? "?"})`;
	return `columns ${e.sources.map(src).join(", ")}${e.aliases.length ? ` | ${e.aliases.join(", ")}` : ""}${typed}`;
}

const USERS = "columns users | users";

test.each<[string, string]>([
	// a line comment runs to the end of the line, the cursor at its end included
	["SELECT * FROM users WHERE -- |", "none"],
	["SELECT * FROM users WHERE -- c|\n", "none"],
	["SELECT * FROM users WHERE |-- c", USERS],
	["SELECT * FROM users WHERE -- FROM\n|", USERS],
	["SELECT * FROM users WHERE -- FROM\r|", USERS],
	["SELECT * FROM users WHERE id - |", USERS],
	["SELECT * FROM users WHERE id-|", USERS],
	// block comments nest; the cursor right after one is outside it
	["SELECT * FROM users WHERE /* | */", "none"],
	["SELECT * FROM users WHERE /* c */|", USERS],
	["SELECT * FROM users WHERE |/* c */", USERS],
	["SELECT * FROM users WHERE /* c |", "none"],
	["SELECT * FROM users WHERE /* c *|", "none"],
	["SELECT * FROM users WHERE /* a /* b */ FROM | */", "none"],
	["SELECT * FROM users WHERE /* a /* b */ c */ |", USERS],
	["SELECT * FROM users WHERE /* a */ id = 1 /* FROM */ AND |", USERS],
	["SELECT * FROM users WHERE /*/ FROM */ |", USERS],
	["SELECT * FROM users WHERE id / |", USERS],
	// an operator ends where a comment starts
	["SELECT * FROM users WHERE id +-- FROM\n|", USERS],
	["SELECT * FROM users WHERE id +/* FROM */ |", USERS],
	["SELECT * FROM users WHERE id <|= 1", "none"],
	["SELECT * FROM users WHERE id <=|", USERS],

	// strings: the cursor in one, or after an unclosed one, is in a literal
	["SELECT * FROM users WHERE name =|'x'", USERS],
	["SELECT * FROM users WHERE name = '|x'", "none"],
	["SELECT * FROM users WHERE name = 'it''s' AND |", USERS],
	["SELECT * FROM users WHERE name = 'a\\' AND |", USERS],
	// backslashes escape in E'…' only
	["SELECT * FROM users WHERE name = E'a\\'b' AND |", USERS],
	["SELECT * FROM users WHERE name = e'a\\'b' AND |", USERS],
	["SELECT * FROM users WHERE name = E'a''\\'b' AND |", USERS],
	["SELECT * FROM users WHERE name = E'a\\\\' AND |", USERS],
	["SELECT * FROM users WHERE name = E'a\\\n' AND |", USERS],
	["SELECT * FROM users WHERE name = E'a\\' AND |", "none"],
	// the prefix belongs to the literal
	["SELECT * FROM users WHERE name = E|'x'", "none"],
	["SELECT * FROM users WHERE name = X|'ff'", "none"],
	["SELECT * FROM users WHERE name = b|'01'", "none"],
	["SELECT * FROM users WHERE name = N|'x'", "none"],
	["SELECT * FROM users WHERE name = U&|'x'", "none"],
	["SELECT * FROM users WHERE name = u&|'x'", "none"],
	["SELECT * FROM users WHERE name = U&'x' AND |", USERS],
	["SELECT * FROM users WHERE name = U|&x", `${USERS} (U)`],

	// quoted identifiers keep their case; `""` is a `"`
	['SELECT * FROM users "Abc" WHERE |', "columns users Abc | Abc"],
	['SELECT * FROM users "a""b" WHERE |', 'columns users a"b | a"b'],
	['SELECT * FROM users U&"Abc" WHERE |', "columns users Abc | Abc"],
	['SELECT * FROM users u&"abc" WHERE |', "columns users abc | abc"],
	['SELECT * FROM users U&|"x"', "none"],
	['SELECT * FROM users "a|b"', "none"],
	['SELECT * FROM users "ab|', "none"],

	// dollar quotes end at the same tag
	["SELECT $$ FROM $$, | FROM users", USERS],
	["SELECT $abc$ FROM $abc$, | FROM users", USERS],
	["SELECT $abc$ FROM | $abc$", "none"],
	["SELECT $abc$ x $ab$ FROM |", "none"],
	["SELECT $abc$ x $abc$ FROM |", "relation"],
	["SELECT $é$ FROM | $é$", "none"],
	["SELECT $|$ FROM users", "none"],
	["SELECT $1$ FROM |", "relation"],
	["SELECT $a FROM |", "relation"],
	["SELECT $|", "columns "],
	[`SELECT $${"t".repeat(70)}$ FROM | $${"t".repeat(70)}$`, "none"],

	// numbers and `$1`, with exponents and trailing letters
	["SELECT * FROM users WHERE id = 10 |", "none"],
	["SELECT * FROM users WHERE id = 1|0", "none"],
	["SELECT * FROM users WHERE id = 1e+|5", "none"],
	["SELECT * FROM users WHERE id = 123e+|5", "none"],
	["SELECT * FROM users WHERE id = 1_0e-|5", "none"],
	["SELECT * FROM users WHERE id = 1.5E-|5", "none"],
	["SELECT * FROM users WHERE id = 12+|5", USERS],
	["SELECT * FROM users WHERE id = 1e+5 + |", USERS],
	["SELECT * FROM users WHERE id IN (1e,|", USERS],
	["SELECT * FROM users WHERE id = .|5", "none"],
	["SELECT * FROM users WHERE id = $|1", "none"],
	["SELECT * FROM users WHERE id = $1 AND |", USERS],
	["SELECT x.| FROM (SELECT 0xff) x", "columns x()"],
	["SELECT x.| FROM (SELECT $1ab) x", "columns x()"],
	["SELECT x.| FROM (SELECT 1 ab) x", "columns x(ab)"],
	["SELECT t1.| FROM t1", "columns t1"],

	// named parameters and `::`
	["SELECT * FROM users WHERE id = :|id", "none"],
	["SELECT x.| FROM (SELECT :abc) x", "columns x()"],
	["SELECT x.| FROM (SELECT :a$1) x", "columns x()"],
	["SELECT a[1:|] FROM users", USERS],
	["SELECT x::|", "none"],
	["SELECT x: |", "columns "],

	// `{slot}`s
	["SELECT | FROM {src}", "columns {src}(?) | {src}"],
	["SELECT | FROM {s_1}", "columns {s_1}(?) | {s_1}"],
	["SELECT | FROM {1x}", "columns "],
	["SELECT | FROM {abc", "columns "],
	["SELECT * FROM users {wh|ere}", "none"],

	// words
	["SELECT * FROM Users WHERE |", USERS],
	["SELECT * FROM ÜSERS WHERE |", "columns Üsers | Üsers"],
	["SELECT * FROM u$ers WHERE |", "columns u$ers | u$ers"],
	["SELECT * FROM _users WHERE |", "columns _users | _users"],
	["SELECT * FROM users1 WHERE |", "columns users1 | users1"],
	["* |", "none"],
	["SELECT * FROM users WHERE id = 1;|", "none"],
	// what an unclosed literal or a comment hides
	["SELECT * FROM users WHERE name = 'a FROM |", "none"],
	["SELECT * FROM users WHERE name = E'a FROM |", "none"],
	["SELECT * FROM users WHERE /* c */ id = | AND x", USERS],
	['SELECT "from", | FROM users', USERS],

	// output names after literals, parameters and subqueries
	["SELECT x.| FROM (SELECT 'a' b) x", "columns x(b)"],
	["SELECT x.| FROM (SELECT $$a$$ b) x", "columns x(b)"],
	["SELECT x.| FROM (SELECT :a b) x", "columns x(b)"],
	["SELECT x.| FROM (SELECT 1, a) x", "columns x(a)"],
	["SELECT x.| FROM (SELECT a as) x", "columns x()"],
	["SELECT x.| FROM (SELECT 1 + (SELECT 2) y) x", "columns x(y)"],
	["SELECT x.| FROM (SELECT ARRAY(SELECT 1)) x", "columns x(array)"],
	["SELECT | FROM (SELECT a", "columns ?(a)"],
	// subqueries start with SELECT, WITH, VALUES or TABLE; a WITH query may modify data
	[
		"WITH x AS (INSERT INTO users (id) VALUES (1) RETURNING id AS b) SELECT x.| FROM x",
		"columns x(b)",
	],
	[
		"WITH x AS (UPDATE users SET a = 1 RETURNING b) SELECT x.| FROM x",
		"columns x(b)",
	],
	[
		"WITH x AS (DELETE FROM users RETURNING b) SELECT x.| FROM x",
		"columns x(b)",
	],
	[
		"WITH x AS (MERGE INTO users u USING posts p ON true WHEN MATCHED THEN DELETE RETURNING b) SELECT x.| FROM x",
		"columns x(b)",
	],
	[
		"WITH x AS (UPDATE users SET | RETURNING b) SELECT * FROM x",
		"columns users",
	],
	["SELECT x.| FROM (VALUES (1)) x", "columns x(?)"],
	["SELECT x.| FROM (TABLE users) x", "columns x(?)"],
	[
		"SELECT x.| FROM (WITH r AS (SELECT 1 a) SELECT a FROM r) x",
		"columns x(a)",
	],
	// a CTE is visible in nested subqueries
	[
		"WITH r AS (SELECT id FROM posts) SELECT * FROM users WHERE EXISTS (SELECT 1 FROM r WHERE r.|)",
		"columns r(id)",
	],
	// a SELECT has no DML target: UPDATE in FOR UPDATE names a relation
	["SELECT * FROM users FOR UPDATE |", "relation"],
])("%s", (marked, want) => {
	expect(at(marked)).toBe(want);
});

test("unquoted names fold ASCII letters only", () => {
	expect(fold("UsErS_ÄÖ")).toBe("users_ÄÖ");
});

test("a statement names no relations before its first FROM item", () => {
	expect(contextAt("SELECT * FROM ", 14).expect).toEqual({
		kind: "relation",
		schema: null,
		ctes: [],
		used: [],
	});
});

const NOT_ALIAS = [
	"on",
	"using",
	"join",
	"inner",
	"left",
	"right",
	"full",
	"outer",
	"cross",
	"natural",
	"where",
	"group",
	"order",
	"having",
	"window",
	"limit",
	"offset",
	"fetch",
	"for",
	"union",
	"intersect",
	"except",
	"returning",
	"values",
	"default",
	"select",
	"set",
	"when",
	"then",
	"lateral",
	"tablesample",
	"with",
	"into",
	"from",
	"and",
	"or",
	"not",
	"overriding",
	"do",
	"only",
	"table",
];
test.each(NOT_ALIAS)("%s after a FROM item is not its alias", (kw) => {
	expect(at(`SELECT | FROM users ${kw}`)).toBe(USERS);
});

const BEFORE_EXPR = [
	"select",
	"where",
	"on",
	"and",
	"or",
	"not",
	"by",
	"having",
	"returning",
	"when",
	"then",
	"else",
	"distinct",
	"case",
	"between",
	"in",
	"like",
	"ilike",
	"all",
	"any",
	"some",
	"exists",
	"array",
];
test.each(BEFORE_EXPR)("a column may follow %s", (kw) => {
	expect(at(`SELECT * FROM users WHERE ${kw} |`)).toBe(USERS);
});

test("the relations a statement names, without its CTEs and subqueries", () => {
	const text =
		"WITH r AS (SELECT id FROM posts) SELECT * FROM r, (SELECT 1) s, ";
	expect(contextAt(text, text.length).expect).toEqual({
		kind: "relation",
		schema: null,
		ctes: [{ name: "r", rel: null, columns: ["id"] }],
		used: [{ schema: null, name: "posts" }],
	});
});
