import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";
import type { DB } from "./schema.js";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const sql = createSql<DB>(db);
export const archived = await sql(
	"SELECT id, title FROM docs_archive ORDER BY id",
).execute();
console.log(archived);
db.close();
