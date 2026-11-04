import { sqlite } from "@typesql/core/sqlite";
import { createSql } from "@typesql/kysely";
import Database from "better-sqlite3";
import { type Generated, Kysely, SqliteDialect } from "kysely";

const connection = new Database(process.env.SQLITE_PATH!);
connection.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, bio text)",
);
const dialect = new SqliteDialect({ database: connection });
interface DB {
	users: { id: Generated<number>; name: string; bio: string | null };
}
const db = new Kysely<DB>({ dialect });
const sql = createSql(sqlite, db);
await db.insertInto("users").values({ name: "Ada", bio: null }).execute();
export const rows = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
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
await db.destroy();
