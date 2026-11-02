import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";
const db = new DatabaseSync(process.env.SQLITE_PATH!);
import type { DB } from "./schema.js";
const sql = createSql<DB>(db);
export const rows = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
).execute();
console.log(rows);
db.close();
