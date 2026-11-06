import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/kysely";
import { type Generated, Kysely, sql as kysql, MysqlDialect } from "kysely";
import { createPool } from "mysql2";

// A Kysely table key "database.table" names a table of another database.
interface DB {
	users: { id: Generated<number>; name: string };
	"typesql_archive.events": {
		id: Generated<number>;
		user_id: number;
		note: string | null;
	};
}
const pool = createPool(String(process.env.DATABASE_URL));
const db = new Kysely<DB>({ dialect: new MysqlDialect({ pool }) });
await kysql`DROP DATABASE IF EXISTS typesql_archive`.execute(db);
await kysql`CREATE DATABASE typesql_archive`.execute(db);
await kysql`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL)`.execute(
	db,
);
await kysql`CREATE TABLE typesql_archive.events (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, note VARCHAR(100))`.execute(
	db,
);
await db.insertInto("users").values({ name: "Ada" }).execute();
await db
	.insertInto("typesql_archive.events")
	.values({ user_id: 1, note: null })
	.execute();

const sql = createSql(mysql, db);
export const inserted = await sql(
	"INSERT INTO typesql_archive.events (user_id, note) VALUES ($1, $2)",
	1,
	"login",
).executeCount();
export const rows = await sql(
	"SELECT e.id, e.note, u.name FROM typesql_archive.events e JOIN users u ON u.id = e.user_id ORDER BY e.id",
).execute();
console.log({ inserted, rows });
await kysql`DROP DATABASE typesql_archive`.execute(db);
await db.destroy();
