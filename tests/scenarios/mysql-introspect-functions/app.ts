import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

import type { DB } from "./schema.js";

const pool = createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool);
export const rows = await sql(
	"SELECT slugify(email) AS slug, slugify(NULL) AS no_slug, add_tax(10, 0.2) AS price, next_id(id) AS next FROM users",
).exec();
console.log(rows);
await pool.end();
