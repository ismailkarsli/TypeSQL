import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);

import type { DB } from "./db.js";

const sql = createSql<DB>(db);
export const rows = await sql(
	"INSERT INTO users (id, name) VALUES ($1, $2) RETURNING id, name, bio",
	1,
	"Ada",
).execute();
console.log(rows);
db.close();
