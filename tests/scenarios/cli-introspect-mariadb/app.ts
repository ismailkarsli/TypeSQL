import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

import type { DB } from "./schema.js";

const pool = createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool, { dialect: "mariadb" });
export const rows = await sql(
	"SELECT id, email, role, bio, slug FROM users ORDER BY id",
).execute();
export const active = await sql(
	"SELECT id, email FROM active_users ORDER BY id",
).execute();
export const star = await sql("SELECT * FROM users WHERE id = $1", 1).execute();
console.log({ rows, active, star });
await pool.end();
