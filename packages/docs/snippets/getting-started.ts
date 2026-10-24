import type { RowType } from "@typesql/core";
import { createSql } from "@typesql/pg";
// #region query
import { Pool } from "pg";
import { check, type Equal } from "./_check.js";
import type { DB } from "./schema.js";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);

const rows = await recent.execute();
// rows: { id: number; email: string; title: string | null }[]
// #endregion query
check<
	Equal<typeof rows, { id: number; email: string; title: string | null }[]>
>();
check<
	Equal<
		RowType<typeof recent>,
		{ id: number; email: string; title: string | null }
	>
>();
// #region text
recent.text; // "SELECT u.id, u.email, p.title FROM users u …"  (sent as is)
recent.values; // [Date]
// #endregion text
