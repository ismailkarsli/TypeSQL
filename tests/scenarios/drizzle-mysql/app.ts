import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/drizzle";
import { int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";

const client = createPool(process.env.DATABASE_URL!);
await client.query(
	"CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, display_name VARCHAR(100) NOT NULL, bio TEXT)",
);
const users = mysqlTable("users", {
	id: int().primaryKey().autoincrement(),
	displayName: varchar("display_name", { length: 100 }).notNull(),
	bio: text(),
});
const db = drizzle({ client, schema: { users }, mode: "default" });
await db.insert(users).values({ displayName: "Ada", bio: null });
const sql = createSql(mysql, db);
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
export const changed = await sql(
	"UPDATE users SET bio = $1 WHERE id = $2",
	"Engineer",
	1,
).executeCount();
console.log({ rows, after, changed });
await client.end();
