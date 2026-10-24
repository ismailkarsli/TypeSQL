import type { ParamsType, RowType } from "@typesql/core";
import { check, type Equal } from "./_check.js";

// #region schema
import type { Col, Generated, Nullable } from "@typesql/core";

export interface DB {
	users: {
		id: Generated<"int4">; // has a default, so INSERT can leave it out
		email: Col<"text">; // NOT NULL
		display_name: Nullable<"text">; // NULL allowed
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
	};
}
// #endregion schema

// #region create
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);
// #endregion create

// #region query
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);
// row:    { id: number; email: string; title: string | null }
// params: [Date | string | null]
// #endregion query
check<
	Equal<
		RowType<typeof recent>,
		{ id: number; email: string; title: string | null }
	>
>();
check<Equal<ParamsType<typeof recent>, [Date | string | null]>>();

// #region run
const rows = await recent.execute();
// { id: number; email: string; title: string | null }[]

const user = await sql(
	"SELECT email, display_name FROM users WHERE id = $1",
	7,
).executeTakeFirstOrThrow();
// { email: string; display_name: string | null }
// #endregion run
check<
	Equal<typeof rows, { id: number; email: string; title: string | null }[]>
>();
check<Equal<typeof user, { email: string; display_name: string | null }>>();

// #region text
recent.text; // "SELECT u.id, u.email, p.title FROM users u …" (sent as written)
recent.values; // [Date]
// #endregion text

// @ts-expect-error column "emial" does not exist. Perhaps you meant the column "email"?
sql("SELECT emial FROM users");
// @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'number'.
sql("SELECT id FROM users WHERE id = $1", "7");
