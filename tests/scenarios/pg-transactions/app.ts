import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		balance: Col<"int4">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, display_name text, balance int NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', 100), (2, NULL, 50)`);
try {
	await sql.transaction(async (tx) => {
		await tx(
			"UPDATE users SET balance = balance - $1 WHERE id = $2",
			10,
			1,
		).execute();
		await tx(
			"UPDATE users SET balance = balance + $1 WHERE id = $2",
			10,
			2,
		).execute();
		throw new Error("abort transfer");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
await sql.transaction(async (tx) => {
	await tx(
		"UPDATE users SET balance = balance + $1 WHERE id = $2",
		1,
		1,
	).execute();
	try {
		await tx.transaction(async (inner) => {
			await inner("DELETE FROM users WHERE id = $1", 2).execute();
			throw new Error("abort savepoint");
		});
	} catch (error) {
		console.log(error instanceof Error ? error.message : error);
	}
});
export const balances = await sql(
	"SELECT id, balance FROM users ORDER BY id",
).execute();
console.log(balances);
await pool.end();
