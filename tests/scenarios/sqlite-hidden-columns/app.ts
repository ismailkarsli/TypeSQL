import { DatabaseSync } from "node:sqlite";
import type { SchemaOf } from "@typesql/core";
import { createSql } from "@typesql/sqlite";
import type { DB } from "./db.js";
import type { DB as Introspected } from "./introspected.js";
import type docs from "./migrations/001-docs.js";

// An FTS5 table's hidden columns (`docs`, `rank`) are left out of an INSERT
// without a column list, so every schema source gives them a default.
export type Migrated = SchemaOf<typeof docs>["docs"]["docs"]["hasDefault"];
export type Generated = DB["docs"]["docs"]["hasDefault"];
export type FromIntrospection = Introspected["docs"]["docs"]["hasDefault"];

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const sql = createSql<DB>(db);
await sql(
	"INSERT INTO docs (title, body) VALUES ($1, $2)",
	"SQL",
	"typed queries",
).execute();
export const found = await sql(
	"SELECT title FROM docs WHERE docs MATCH $1",
	"typed",
).execute();
console.log(found);
db.close();
