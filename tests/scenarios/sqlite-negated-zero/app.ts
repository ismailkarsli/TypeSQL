import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	items: { id: Col<"integer"> };
}

const db = new DatabaseSync(process.env.SQLITE_PATH ?? ":memory:");
db.exec(
	"CREATE TABLE items (id integer NOT NULL); INSERT INTO items VALUES (6)",
);
const sql = createSql<DB>(db);
export const divided = await sql(`
	SELECT id / - -0 AS negatedZero, id % - -0 AS negatedZeroRemainder,
		id / -0 AS negativeZero, id / - -2 AS negatedTwo, id / +2 AS plusTwo,
		id / +0 AS plusZero
	FROM items
`).execute();
console.dir({ divided }, { depth: null });
db.close();
