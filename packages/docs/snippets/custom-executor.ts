import { check, type Equal } from "./_check.js";
import type { DB } from "./schema.js";
import { Pool } from "pg";

const pool = new Pool();

// #region without-client
import { createSql, mapRows } from "@typesql/core";

const sql = createSql<DB>(); // builds queries, runs none

const q = sql("SELECT id, email FROM users WHERE id = $1", 7);
q.text; // "SELECT id, email FROM users WHERE id = $1"
q.values; // [7]

// run it yourself, then let mapRows type the rows (and apply rowKeys)
const result = await pool.query(q.text, [...q.values]);
const rows = mapRows(q, result.rows); // { id: number; email: string }[]
// #endregion without-client
check<Equal<typeof rows, { id: number; email: string }[]>>();

// #region write
import type { Executor } from "@typesql/core";

const onPool: Executor = async (text, values) => {
	const result = await pool.query(text, [...values]);
	return { rows: result.rows, rowCount: result.rowCount }; // with a count, executeCount works too
};

const db = createSql<DB>(onPool);
const users = await db("SELECT id FROM users").execute(); // { id: number }[]
const changed = await db(
	"DELETE FROM posts WHERE author_id = $1",
	7,
).executeCount(); // number
// #endregion write
check<Equal<typeof users, { id: number }[]>>();
check<Equal<typeof changed, number>>();
