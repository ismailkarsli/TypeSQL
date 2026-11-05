import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	users: {
		id: Col<"int", { autoIncrement: true }>;
		name: Col<"varchar">;
		bio: Col<"varchar", { nullable: true }>;
	};
}
const pool = createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool, { dialect: "mariadb" });
export const dialect = sql.dialect;
await pool.query(
	"CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, bio VARCHAR(100))",
);
export const inserted = await sql(
	"INSERT INTO users (name, bio) VALUES ($1, $2) RETURNING id, name, bio",
	"Ada",
	null,
).execute();
export const counted = await sql(
	"SELECT COUNT(*) AS n FROM users",
).executeTakeFirstOrThrow();
export const literal = await sql(
	"SELECT 'a' 'b' AS joined, 1 + 1 AS sum, id > 0 AS positive FROM users",
).executeTakeFirstOrThrow();
console.log({ dialect, inserted, counted, literal });
await pool.end();
