import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
const client = new Pool({ connectionString: process.env.DATABASE_URL });
await client.query(
	"CREATE TABLE users (id serial PRIMARY KEY, display_name text NOT NULL, bio text)",
);
import { createSql } from "@typesql/drizzle";
import { postgres } from "@typesql/core/postgres";
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
	console.log((error as Error).message);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
console.log({ rows, after });
await client.end();
