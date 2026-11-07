import { setTimeout as sleep } from "node:timers/promises";
import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createConnection } from "mysql2/promise";

const connection = await createConnection(process.env.DATABASE_URL!);
try {
	await connection.query("CREATE TABLE notes (body VARCHAR(20) NOT NULL)");
	const sql = createSql<{ notes: { body: Col<"varchar"> } }>(connection);

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
	await connection.end();
}
