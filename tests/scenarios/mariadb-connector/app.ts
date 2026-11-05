import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql/mariadb";
import mariadb from "mariadb";

interface DB {
	users: {
		id: Col<"int", { autoIncrement: true }>;
		name: Col<"varchar">;
		bio: Col<"varchar", { nullable: true }>;
		score: Col<"bigint", { hasDefault: true }>;
	};
}
const pool = mariadb.createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool);
export const dialect = sql.dialect;
await pool.query(
	"CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, bio VARCHAR(100), score BIGINT NOT NULL DEFAULT 0)",
);
export const inserted = await sql(
	"INSERT INTO users (name, bio) VALUES ($1, $2), ($3, $4) RETURNING id, name, bio",
	"Ada",
	null,
	"Grace",
	"Compiler",
).execute();
export const rows = await sql(
	"SELECT id, name, bio, score FROM users ORDER BY id",
).execute();
export const counted = await sql(
	"SELECT COUNT(*) AS n, MAX(score) AS best FROM users",
).executeTakeFirstOrThrow();
export const named = await sql("SELECT name FROM users WHERE id = :id", {
	id: 1,
}).executeTakeFirstOrThrow();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		await tx.transaction(async (inner) => {
			await inner("DELETE FROM users WHERE id = $1", 2).execute();
		});
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
export const deleted = await sql(
	"DELETE FROM users WHERE id = $1 RETURNING id",
	2,
).execute();
console.log({ dialect, inserted, rows, counted, named, after, deleted });
await pool.end();
