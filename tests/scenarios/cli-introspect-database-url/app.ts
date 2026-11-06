import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

// `typesql introspect` without --dialect or --url reads DATABASE_URL, and
// its mysql:// scheme selects MySQL.
import type { DB } from "./schema.js";

const pool = createPool(String(process.env.DATABASE_URL));
const sql = createSql<DB>(pool);
export const rows = await sql("SELECT id, email, bio FROM users").execute();
console.log(rows);
await pool.end();
