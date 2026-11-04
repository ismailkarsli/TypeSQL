import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	items: {
		id: Col<"integer">;
		value: Col<"integer", { nullable: true }>;
	};
}

const db = new DatabaseSync(process.env.SQLITE_PATH ?? ":memory:");
db.exec(`CREATE TABLE items (id integer NOT NULL, value integer);
	INSERT INTO items VALUES (1, NULL), (3, 5)`);
const sql = createSql<DB>(db);
export const aggregate = await sql(`
	SELECT CASE WHEN count(*) > 0 THEN sum(value) ELSE 0 END AS total,
		sum(id) IN (SELECT id FROM items) AS contained
	FROM items
`).execute();
export const subquery = await sql(`
	SELECT id, (SELECT max(value) FROM items) AS maximum
	FROM items ORDER BY id
`).execute();
export const windows = await sql(`
	SELECT id, CASE WHEN id > 0 THEN sum(value) OVER running ELSE 0 END AS total,
		CASE WHEN id > 0 THEN sum(id) OVER running ELSE 0 END AS ids
	FROM items WINDOW running AS (ORDER BY id) ORDER BY id
`).execute();
console.dir({ aggregate, subquery, windows }, { depth: null });
db.close();
