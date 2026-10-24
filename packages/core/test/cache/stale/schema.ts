// The schema and statements the staleness cache is generated from (see setup.ts). The tests
// (stale.test-d.ts) change one input at a time and check that the results are computed again.
import {
	type ApplyDdl,
	type Col,
	createSql,
	type DefaultTypeMap,
	type Generated,
	migrations,
	type Nullable,
	type RowOf,
	type Sig,
} from "../../../src/index.js";

export interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		name: Nullable<"text">;
		mood: Nullable<"mood">;
	};
	posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
	$types: { mood: "happy" | "sad" };
	$functions: { score: Sig<["int4"], "int4">; bonus: Sig<["int4"], "int4"> };
}

export const sql = createSql<DB>();
export const camel = createSql<DB>(undefined, { rowKeys: "camelCase" });

export const Q = {
	select: "SELECT id, email, name FROM users",
	alias: "SELECT u.id, p.title FROM users u JOIN posts p ON p.author_id = u.id",
	cte: "WITH t AS (SELECT id FROM users) SELECT t.id FROM t",
	mood: "SELECT mood FROM users",
	fn: "SELECT score(id) AS s FROM users",
	fn2: "SELECT bonus(id) AS b FROM users",
	insert: "INSERT INTO posts VALUES (DEFAULT, 1, 'x') RETURNING id",
	param: "SELECT id FROM users WHERE id = $1",
	error: "SELECT nmae FROM users",
} as const;

// as calls (call and analysis entries) …
export const calls = [
	sql(Q.select),
	sql(Q.alias),
	sql(Q.cte),
	sql(Q.mood),
	sql(Q.fn),
	sql(Q.fn2),
	sql(Q.insert),
	sql(Q.param, 1),
	camel("SELECT name AS display_name FROM users"),
];
// … and as types (analysis entries)
export type Rows = [
	RowOf<DB, DefaultTypeMap, "SELECT id, email, name FROM users">,
	RowOf<DB, DefaultTypeMap, "SELECT nmae FROM users">,
];
export const m = migrations<DB>().add("ALTER TABLE users ADD COLUMN bio text");
export type Created = ApplyDdl<
	DB,
	"CREATE TABLE tags (id int4 PRIMARY KEY, label text NOT NULL)"
>;
