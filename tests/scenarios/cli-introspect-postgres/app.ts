import { createSql } from "@typesql/pg";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

import type { DB } from "./schema.js";

const sql = createSql<DB>(db);
export const rows = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
).execute();
console.log(rows);
await db.end();
