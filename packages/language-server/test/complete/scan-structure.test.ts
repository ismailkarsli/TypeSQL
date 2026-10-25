import { expect, test } from "vitest";
import {
	contextAt,
	type RelRef,
	type ScopeItem,
} from "../../src/complete/scan.js";

const rel = (r: RelRef): string =>
	`${r.schema === null ? "" : `${r.schema}.`}${r.name}`;
const cols = (c: readonly string[] | null): string =>
	c ? `(${c.join(",")})` : "";
/** `name` (a relation under its own name), `alias=schema.rel`, `~name` (no relation), then `(columns)`. */
const src = (s: ScopeItem): string => {
	const r = s.rel ? rel(s.rel) : null;
	return (
		(r === null ? `~${s.name}` : s.name === r ? r : `${s.name}=${r}`) +
		cols(s.columns)
	);
};

/**
 * The context at `|` with every field written out: `none`, `relation [schema] [+ctes] [used …]`
 * or `columns <sources> [| aliases]`, then ` (typed)` when the completion replaces typed text.
 */
function ctx(marked: string): string {
	const offset = marked.indexOf("|");
	const text = marked.slice(0, offset) + marked.slice(offset + 1);
	const { expect: e, from } = contextAt(text, offset);
	const typed = from === offset ? "" : ` (${text.slice(from, offset)})`;
	switch (e.kind) {
		case "none":
			return `none${typed}`;
		case "relation":
			return `relation${e.schema === null ? "" : ` ${e.schema}`}${e.ctes.length ? ` +${e.ctes.map((c) => c.name + cols(c.columns)).join(",")}` : ""}${e.used.length ? ` used ${e.used.map(rel).join(",")}` : ""}${typed}`;
		case "column":
			return `columns ${e.sources.map(src).join(", ")}${e.aliases.length ? ` | ${e.aliases.join(", ")}` : ""}${typed}`;
		default:
			return `? ${JSON.stringify(e)}`;
	}
}

/** `SELECT x.| FROM (<query>) x`: the output names the scan reads from a subquery. */
const outputs = (query: string): string =>
	ctx(`SELECT x.| FROM (${query}) x`).replace(/^columns ~x/, "");

const cases: [string, string][] = [
	// a parenthesis after the DML target is its column list; after another FROM item, names
	["INSERT INTO users AS u (id, |", "columns u=users"],
	["SELECT 1 INTO x(a) WHERE x.|", "columns x(a)"],
	["UPDATE users x(a) SET x.|", "columns x=users(a)"],
	['SELECT g.| FROM generate_series(1, 3) AS g("N", m)', "columns ~g(N,m)"],
	["WITH c(a, b) AS (SELECT 1, 2) SELECT * FROM |", "relation +c(a,b)"],
	// a parenthesis inside a names list is not one
	["WITH c(a, (b)) AS (SELECT 1, 2) SELECT * FROM |", "relation +c(a)"],
	["WITH c AS (SELECT 1) SELECT count(|) FROM users", "columns users | users"],

	// JOIN … USING, ON, and the FROM list going on after them
	["SELECT * FROM a JOIN b USING (id, |", "columns a, b | a, b"],
	["SELECT * FROM a JOIN b USING |", "none"],
	["SELECT * FROM a JOIN b USING (id), |", "relation used a,b"],
	["SELECT * FROM a JOIN b ON a.id = b.id, |", "relation used a,b"],
	["SELECT * FROM a CROSS JOIN b, |", "relation used a,b"],
	["SELECT * FROM a ORDER BY id USING <, |", "columns a | a"],
	["SELECT DISTINCT ON (a) a, | FROM t", "columns t | t"],

	// VALUES rows expect nothing; an expression's parenthesis does
	["INSERT INTO users VALUES (1), (|", "none"],
	["INSERT INTO users VALUES (1), |", "none"],
	["INSERT INTO users VALUES (1, (|", "columns users | users"],
	["SELECT count(1, values (2, |", "none"],
	["SELECT a, (|) FROM users", "columns users | users"],
	["SELECT count(a, |) FROM users", "columns users | users"],

	// FROM items
	["SELECT * FROM generate_series(1, 3) g, |", "relation"],
	["SELECT * FROM generate_series(1, 3) WITH ORDINALITY, |", "relation"],
	["SELECT * FROM f(1) WHERE |", "columns ~f | f"],
	["SELECT count(a), | FROM users", "columns users | users"],
	["SELECT * FROM {tab} t WHERE |", "columns ~t | t"],
	["SELECT * FROM {tab} WHERE |", "columns ~{tab} | {tab}"],
	['SELECT * FROM auth."Sessions" s WHERE |', "columns s=auth.Sessions | s"],
	["SELECT * FROM auth.sessions |", "none"],
	["SELECT * FROM (SELECT 1) WHERE |", "columns ~()"],
	// a `${…}` is not a relation
	["SELECT * FROM $0 WHERE |", "columns "],
	// a name before `.` is not an alias; a second name is not one either
	["SELECT * FROM users x.|", "columns x"],
	["SELECT u.| FROM users u x", "columns u=users"],
	// a CTE is read by its unqualified name only
	[
		"WITH sessions AS (SELECT 1 AS a) SELECT * FROM auth.sessions s WHERE s.|",
		"columns s=auth.sessions",
	],
	["WITH r AS (SELECT a FROM t) SELECT | FROM r", "columns ~r(a) | r"],
	["SELECT | FROM (SELECT a, b", "columns ~(a,b)"],

	// CTEs
	[
		"WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM |",
		"relation +a(),b()",
	],
	['WITH "Recent" AS (SELECT 1) SELECT * FROM |', "relation +Recent()"],
	["WITH RECURSIVE r AS (SELECT 1) SELECT * FROM |", "relation +r()"],
	["WITH 1 AS (SELECT 2) SELECT * FROM |", "relation"],
	["WITH r AS (SELECT 1) TABLE |", "relation +r()"],
	["WITH a AS (SELECT 1), |", "none"],
	["SELECT a::timestamp with time zone, | FROM t", "columns t | t"],
	[
		"WITH r AS (SELECT 1) SELECT * FROM a UNION SELECT * FROM |",
		"relation +r() used a",
	],

	// statements
	["SELECT 1; SELECT * FROM |", "relation"],
	["SELECT 1; SELECT * FROM b WHERE |", "columns b | b"],
	["SELECT a; SELECT | FROM b", "columns b | b"],
	["SELECT 1; WITH c AS (SELECT 1) SELECT * FROM |", "relation +c()"],
	["SELECT 1; |", "none"],
	["SELECT a; DELETE FROM users WHERE |", "columns users | users"],
	// a stray `)`
	["SELECT 1) |", "none"],
	["SELECT 1) x.|", "columns x"],
	["SELECT 1) SELECT * FROM users WHERE |", "columns users | users"],

	// set operations
	[
		"SELECT id FROM users INTERSECT SELECT | FROM posts",
		"columns posts | posts",
	],
	["SELECT id FROM users EXCEPT SELECT | FROM posts", "columns posts | posts"],

	// DML
	["INSERT INTO t TABLE |", "relation used t"],
	[
		"INSERT INTO users SELECT * FROM posts WHERE |",
		"columns users, posts | users, posts",
	],
	[
		"MERGE INTO users u USING posts p ON true WHEN MATCHED THEN UPDATE |",
		"none",
	],
	["INSERT INTO users (id) VALUES (1) ON CONFLICT (id) DO UPDATE |", "none"],
	[
		"INSERT INTO users VALUES (1) ON CONFLICT (id) DO UPDATE SET a = |",
		"columns users, excluded=users | users",
	],
	[
		"INSERT INTO {t} VALUES (1) ON CONFLICT DO UPDATE SET a = excluded.|",
		"columns excluded",
	],
	["SELECT * FROM users ON CONFLICT DO UPDATE SET |", "none"],
	["INSERT INTO t SELECT 1 UNION SELECT 2 ON CONFLICT (|", "columns t"],
	["INSERT INTO t SELECT 1 UNION SELECT 2 RETURNING |", "columns t | t"],
	["INSERT INTO t SELECT 1 UNION SELECT a FROM s RETURNING |", "columns s | s"],
	["UPDATE users SET a = 1 FROM t2 JOIN t3 USING |", "none"],
	["INSERT INTO t SELECT 1 ORDER BY 1 USING |", "none"],
	["SELECT * FROM a USING |", "none"],
	["DELETE FROM users USING a, |", "relation used users,a"],
	["DELETE FROM users RETURNING id, |", "columns users | users"],
	// row locks
	["SELECT * FROM users FOR UPDATE |", "none"],
	["SELECT * FROM users FOR NO KEY UPDATE |", "none"],

	// clauses
	["SELECT * FROM users ORDER BY id, |", "columns users | users"],
	["SELECT * FROM t WINDOW w AS (ORDER BY a), |", "none"],

	// after `.`
	["u.|", "columns u"],
	[".|", "none"],
	['SELECT "."u.| FROM users u', "columns u=users"],
	["SELECT (u).| FROM users u", "none"],
	["SELECT db.auth.sessions.| FROM t", "columns sessions=auth.sessions"],
	["TABLE auth.|", "relation auth used auth"],
	["SELECT * FROM db.auth.|", "none"],
	["WITH c AS (SELECT 1) SELECT * FROM auth.|", "relation auth used auth"],
	["WITH r AS (SELECT id FROM posts) SELECT r.|", "columns ~r(id)"],
	[
		"WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) SELECT b.|",
		"columns ~b(y)",
	],
	[
		"WITH r AS (SELECT a) SELECT * FROM users WHERE EXISTS (SELECT r.|)",
		"columns ~r(a)",
	],

	// after an operator or a closing token
	["SELECT count(*) |", "none"],
	["SELECT a[1] |", "none"],
	["SELECT -| FROM users", "columns users | users"],
	["SELECT u.*| FROM users u", "none"],
	["SELECT count(*|) FROM users", "none"],
	["SELECT id, *| FROM users", "none"],
	['SELECT "select" * | FROM users', "columns users | users"],
	['SELECT "," * | FROM users', "columns users | users"],
	["SELECT (a) * | FROM users", "columns users | users"],
	// quoted punctuation is a name
	['SELECT 1 ","| FROM users', "none"],

	// the cursor
	[" |  SELECT", "none"],
	["SELECT * FROM t WHERE a <|> b", "none"],
	["SELECT * FROM -- |", "none"],
	["|", "none"],
];

test.each(cases)("%s", (marked, want) => {
	expect(ctx(marked)).toBe(want);
});

test.each<[string, string]>([
	// a name, `t.name`, `expr alias`, `expr AS alias`, `f(…)`; nothing for other expressions
	[
		"SELECT count(*), f(a) AS b, a b2, 1 c, 'x' d, $1 e, :p f, {s} g, (a) h, \"q\" i",
		"(count,b,b2,c,d,e,f,g,h,i)",
	],
	['SELECT "Id"', "(Id)"],
	["SELECT t.a FROM t", "(a)"],
	["SELECT 1", "()"],
	["SELECT 'x'", "()"],
	["SELECT a + b", "()"],
	["SELECT count(*) + 1", "()"],
	["SELECT -(a)", "()"],
	["SELECT count((a))", "(count)"],
	["SELECT id, active AND", "(id)"],
	["SELECT a, FROM t", "(a)"],
	['SELECT a ","', "(,)"],
	['SELECT a ";"', "(;)"],
	// the select list ends at FROM, a clause or the `)`
	["SELECT id, email", "(id,email)"],
	["SELECT a, b FROM t GROUP BY b, c", "(a,b)"],
	["SELECT a, b FROM t JOIN u ON true", "(a,b)"],
	["SELECT a, b WHERE c", "(a,b)"],
	["SELECT a, b HAVING c", "(a,b)"],
	["SELECT a, b WINDOW w AS ()", "(a,b)"],
	["SELECT a, b LIMIT 1", "(a,b)"],
	["SELECT a, b OFFSET 1", "(a,b)"],
	["SELECT DISTINCT ON (a) a, b FROM t", "(a,b)"],
	// a set operation's columns are named by its first branch
	["SELECT a FROM t UNION SELECT b, c FROM u", "(a)"],
	["SELECT a, b UNION SELECT c, d", "(a,b)"],
	// RETURNING names a data-modifying statement's columns
	[
		"WITH v AS (SELECT 1) INSERT INTO t SELECT a FROM s RETURNING b, c",
		"(b,c)",
	],
])("output names: %s", (query, want) => {
	expect(outputs(query)).toBe(want);
});
