import { setTimeout as sleep } from "node:timers/promises";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";
import Database from "better-sqlite3";

const database = new Database(process.env.SQLITE_PATH!);
try {
	database.exec("CREATE TABLE notes (body TEXT NOT NULL)");
	const sql = createSql<{ notes: { body: Col<"text"> } }>(database);

	const results = await Promise.allSettled([
		sql.transaction(async (tx) => {
			await tx("INSERT INTO notes (body) VALUES ('kept')").execute();
			await sleep(10);
		}),
		// The connection is one session: this can't start while the first is open.
		sql.transaction(async (tx) => {
			await tx("INSERT INTO notes (body) VALUES ('never')").execute();
		}),
	]);
	console.log(
		results.map((result) =>
			result.status === "rejected" ? String(result.reason) : result.status,
		),
	);

	// Neither can one on the outer `sql` inside a transaction, which rolls back.
	await sql
		.transaction(async (tx) => {
			await tx("INSERT INTO notes (body) VALUES ('rolled back')").execute();
			await sql.transaction(async () => {});
		})
		.catch((error: Error) => console.log("nested:", error.message));

	// One that starts after the others ended runs.
	await sql.transaction(async (tx) => {
		await tx("INSERT INTO notes (body) VALUES ('later')").execute();
	});
	console.log(await sql("SELECT body FROM notes ORDER BY body").execute());
} finally {
	database.close();
}
