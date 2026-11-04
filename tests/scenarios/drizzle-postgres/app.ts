import { drizzle } from "drizzle-orm/postgres-js";
import postgresClient from "postgres";

const client = postgresClient(process.env.DATABASE_URL!);
await client.unsafe(
	"CREATE TABLE users (id serial PRIMARY KEY, display_name text NOT NULL, bio text)",
);

import { postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/drizzle";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

const users = pgTable("users", {
	id: serial().primaryKey(),
	displayName: text("display_name").notNull(),
	bio: text(),
});
const db = drizzle(client, { schema: { users } });
await db.insert(users).values({ displayName: "Ada", bio: null });
const sql = createSql(postgres, db);
export const rows = await sql(
	"SELECT id, display_name, bio FROM users ORDER BY id",
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
console.log({ rows, after });
await client.end();
