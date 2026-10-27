import { Pool } from "pg";
import { createSql as createPgSql } from "@typesql/pg";
import {
	type Col,
	createSql,
	type Generated,
	type Json,
	type Nullable,
	type ParamsType,
	type RowType,
} from "@typesql/core";
import { check, type Equal } from "./_check.js";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
		role: Col<"text">;
		metadata: Json<{ theme: "light" | "dark" }, { nullable: true }>;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
	};
}

const sql = createSql<DB>();

// #region sql-query
// Positional parameters
const byRole = sql(
	"SELECT id, email FROM users WHERE role = $1 ORDER BY id",
	"admin",
);
// RowType: { id: number; email: string }
// ParamsType: [string]
// #endregion sql-query

// #region sql-named
// Named parameters
const byEmail = sql(
	"SELECT id, role FROM users WHERE email = :email AND role = :role",
	{ email: "user@example.com", role: "member" },
);
// text: "SELECT id, role FROM users WHERE email = $1 AND role = $2"
// #endregion sql-named

// #region sql-slots
// Fragment slots
const activeOnly = sql.fragment("AND role = $1", "active");
const filtered = sql(
	"SELECT id, email FROM users WHERE id > $1 {filter}",
	{ filter: activeOnly },
	10,
);
// #endregion sql-slots

// #region sql-as
// Escape hatch for custom/dynamic SQL
type Summary = { count: number; role: string };
const summary = sql.as<Summary>(
	"SELECT count(*)::int AS count, role FROM users GROUP BY role",
);
// RowType: Summary
// #endregion sql-as

// #region sql-param
// Inline parameters
const userId = 42;
const byId = sql(`SELECT email FROM users WHERE id = ${sql.param(userId)}`);
// #endregion sql-param

// #region sql-json
// Inline JSON values
const settings = { theme: "dark" as const };
const updateSettings = sql(`
  UPDATE users SET metadata = ${sql.json(settings)} WHERE id = ${sql.param(1)}
`);
// #endregion sql-json

// #region sql-fragment
// Reusable SQL fragments
const whereRole = sql.fragment("WHERE role = $1", "admin");
const countAdmins = sql("SELECT count(*) FROM users {whereRole}", {
	whereRole,
});
// #endregion sql-fragment

// #region sql-id
// Quoted identifiers
const col = sql.id("email");
const fqTable = sql.id("public", "users");
const customSelect = sql("SELECT {col} FROM {fqTable}", { col, fqTable });
// customSelect.text: 'SELECT "email" FROM "public"."users"'
// #endregion sql-id

// #region sql-combine
// Combining fragments
const filters = [
	sql.fragment("role = $1", "admin"),
	sql.fragment("id > $1", 5),
];
const combinedWhere = sql.combine(filters, { separator: " AND " });
const queryCombined = sql("SELECT id FROM users WHERE {where}", {
	where: combinedWhere,
});
// #endregion sql-combine

// #region sql-set
// SET helper for UPDATE
const changes = { display_name: "Ada", role: undefined };
const setClause = sql.set("users", changes);
const updateQuery = sql(
	"UPDATE users SET {setClause} WHERE id = $1 RETURNING id",
	{ setClause },
	1,
);
// 'UPDATE users SET "display_name" = $2 WHERE id = $1 RETURNING id'
// #endregion sql-set

// #region sql-values
// VALUES helper for INSERT
const newUsers = [
	{ email: "ada@example.com", role: "admin" },
	{ email: "grace@example.com", role: "member", display_name: "Grace" },
];
const insertValues = sql.values("users", newUsers);
const insertQuery = sql(
	"INSERT INTO users {insertValues} RETURNING id, email",
	{ insertValues },
);
// #endregion sql-values

// #region sql-raw
// Raw untyped SQL text (requires sql.as)
const rawSnippet = sql.raw("ORDER BY id DESC");
const sorted = sql.as<{ id: number }>("SELECT id FROM users {order}", {
	order: rawSnippet,
});
// #endregion sql-raw

// #region sql-transaction
// Transactions with adapter
const pgSql = createPgSql<DB>(new Pool());
const createdId = await pgSql.transaction(async (tx) => {
	const user = await tx(
		"INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id",
		"dev@example.com",
		"engineer",
	).executeTakeFirstOrThrow();
	await tx(
		"INSERT INTO posts (author_id, title) VALUES ($1, $2)",
		user.id,
		"Getting Started",
	).execute();
	return user.id;
});
// #endregion sql-transaction

// #region query-methods
const q = sql("SELECT id, email FROM users WHERE id = $1", 1);

// Inspection properties
const text = q.text; // "SELECT id, email FROM users WHERE id = $1"
const values = q.values; // [1]

// Execution methods (require an executor / adapter client)
declare const runner: typeof q;
const allRows = await runner.execute(); // Promise<{ id: number; email: string }[]>
const first = await runner.executeTakeFirst(); // Promise<{ id: number; email: string } | undefined>
const single = await runner.executeTakeFirstOrThrow(); // Promise<{ id: number; email: string }>
const count = await runner.executeCount(); // Promise<number>
// #endregion query-methods

// Type assertions
check<Equal<RowType<typeof byRole>, { id: number; email: string }>>();
check<Equal<ParamsType<typeof byRole>, [string | null]>>();
check<Equal<RowType<typeof summary>, Summary>>();
check<Equal<typeof createdId, number>>();
check<Equal<typeof allRows, { id: number; email: string }[]>>();
check<Equal<typeof first, { id: number; email: string } | undefined>>();
check<Equal<typeof single, { id: number; email: string }>>();
check<Equal<typeof count, number>>();

void byEmail;
void filtered;
void byId;
void updateSettings;
void countAdmins;
void customSelect;
void queryCombined;
void updateQuery;
void insertQuery;
void sorted;
void text;
void values;
