import { sqlite } from "@typesql/core/sqlite";
import { createSql } from "@typesql/kysely";
import Database from "better-sqlite3";
import { type Generated, Kysely, SqliteDialect } from "kysely";

const connection = new Database(process.env.SQLITE_PATH);
connection.exec(`
	ATTACH DATABASE ':memory:' AS archive;
	CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL);
	CREATE TABLE archive.events (id integer PRIMARY KEY, user_id integer NOT NULL, note text);
`);
// A Kysely table key "schema.table" names a table of an attached database;
// "main.table" one of the main database.
interface DB {
	"main.users": { id: Generated<number>; name: string };
	"archive.events": {
		id: Generated<number>;
		user_id: number;
		note: string | null;
	};
}
const db = new Kysely<DB>({
	dialect: new SqliteDialect({ database: connection }),
});
await db.insertInto("main.users").values({ name: "Ada" }).execute();
await db
	.insertInto("archive.events")
	.values({ user_id: 1, note: null })
	.execute();

const sql = createSql(sqlite, db);
export const inserted = await sql(
	"INSERT INTO archive.events (user_id, note) VALUES ($1, $2)",
	1,
	"login",
).executeCount();
export const rows = await sql(
	"SELECT e.id, e.note, u.name FROM archive.events e JOIN users u ON u.id = e.user_id ORDER BY e.id",
).execute();
console.log({ inserted, rows });
await db.destroy();
