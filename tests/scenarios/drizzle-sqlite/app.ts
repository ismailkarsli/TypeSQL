import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
const client = new Database(process.env.SQLITE_PATH!);
client.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, display_name text NOT NULL, bio text)",
);
import { createSql } from "@typesql/drizzle";
import { sqlite } from "@typesql/core/sqlite";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
const users = sqliteTable("users", {
	id: integer().primaryKey(),
	displayName: text("display_name").notNull(),
	bio: text(),
});
const db = drizzle(client, { schema: { users } });
await db.insert(users).values({ displayName: "Ada", bio: null });
const sql = createSql(sqlite, db);
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
client.close();
