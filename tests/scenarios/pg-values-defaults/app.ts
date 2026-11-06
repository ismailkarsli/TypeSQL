import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import pg from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text", { hasDefault: true }>;
		bio: Col<"text", { nullable: true }>;
	};
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
	"CREATE TABLE users (id int4 PRIMARY KEY, name text NOT NULL DEFAULT 'anonymous', bio text)",
);
const sql = createSql<DB>(client);
const bio: string | undefined = undefined;
const rows: { id: number; name?: string }[] = [{ id: 4, name: "d" }, { id: 5 }];

// PostgreSQL writes DEFAULT for a column a row leaves out.
await sql(
	`INSERT INTO users ${sql.values("users", [{ id: 1, name: "a" }, { id: 2 }])}`,
).execute();
await sql(
	`INSERT INTO users ${sql.values([
		{ id: 3, bio },
		{ id: 6, bio: "f" },
	])}`,
).execute();
await sql(`INSERT INTO users ${sql.values("users", rows)}`).execute();
export const users = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
).execute();
console.log(users);
await client.end();
