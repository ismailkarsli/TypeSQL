import { createSql } from "@typesql/pg";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

import type { DB } from "./db.js";

const sql = createSql<DB>(db);
export const rows = await sql(
	"INSERT INTO users (id, name) VALUES ($1, $2) RETURNING id, name, bio",
	1,
	"Ada",
).execute();
console.log(rows);
await db.end();
