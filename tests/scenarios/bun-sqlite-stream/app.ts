import { Database } from "bun:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	users: { id: Col<"integer">; name: Col<"text"> };
}
const db = new Database(process.env.SQLITE_PATH!);
db.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL); INSERT INTO users VALUES (1, 'user 1'), (2, 'user 2'), (3, 'user 3')",
);
const sql = createSql<DB>(db);

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
	const all: T[] = [];
	for await (const row of rows) all.push(row);
	return all;
}

export const rows = await collect(
	sql("SELECT id, name FROM users ORDER BY id").stream({ batchSize: 2 }),
);
let seen = 0;
for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
	batchSize: 1,
})) {
	if (++seen === 2) break;
}
export const afterBreak = await sql(
	"SELECT count(*) AS n FROM users",
).execOne();

console.dir({ rows, seen, afterBreak }, { depth: null });
