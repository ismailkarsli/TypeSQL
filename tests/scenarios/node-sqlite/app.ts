import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	users: {
		id: Col<"integer">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
}
const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, bio text); INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'Compiler')",
);
const sql = createSql<DB>(db);
export const rows = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
).execute();
export const named = await sql("SELECT name FROM users WHERE id = :id", {
	id: 1,
}).executeTakeFirstOrThrow();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
export const changed = await sql(
	"UPDATE users SET bio = $1 WHERE id = $2",
	"Engineer",
	1,
).executeCount();
const prepared = sql.prepare("SELECT id, name FROM users WHERE id = $1");
export const reused = await prepared(2).execute();
const big = createSql<DB>(db, { bigint: true });
export const bigRows = await big("SELECT 9007199254740993 AS id").execute();
export const division = await sql("SELECT 7 / $1 AS divided", 2).execute();
console.log({ rows, named, after, changed, reused, bigRows, division });
db.close();
