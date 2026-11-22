import { postgresDialect } from "@typesql/core/postgres";
import { sqliteDialect } from "@typesql/core/sqlite";
import { createSql } from "@typesql/kysely";
import Database from "better-sqlite3";
import { type Generated, Kysely, PostgresDialect, SqliteDialect } from "kysely";
import pg from "pg";
import Cursor from "pg-cursor";

interface DB {
	users: { id: Generated<number>; name: string };
}
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
	const all: T[] = [];
	for await (const row of rows) all.push(row);
	return all;
}
const message = (promise: Promise<unknown>) =>
	promise.then(
		() => "resolved",
		(error: Error) => error.message,
	);

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	max: 1,
});
await pool.query(`CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL);
  INSERT INTO users (name) SELECT 'user ' || i FROM generate_series(1, 5) i;`);
// PostgresDialect streams with its cursor option.
const db = new Kysely<DB>({
	dialect: new PostgresDialect({ pool, cursor: Cursor }),
});
const sql = createSql(postgresDialect, db);
export const rows = await collect(
	sql("SELECT id, name FROM users WHERE id > $1 ORDER BY id", 1).stream({
		batchSize: 2,
	}),
);
let seen = 0;
for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
	batchSize: 1,
})) {
	if (++seen === 2) break;
}
const afterBreak = await sql("SELECT count(*)::int AS n FROM users").execOne();
export const inTransaction = await sql.transaction(async (tx) => {
	await tx("DELETE FROM users WHERE id > $1", 3).exec();
	return collect(tx("SELECT id FROM users ORDER BY id").stream());
});
const withoutCursor = await message(
	collect(
		createSql(
			postgresDialect,
			new Kysely<DB>({ dialect: new PostgresDialect({ pool }) }),
		)("SELECT id FROM users").stream(),
	),
);
await db.destroy();

const sqlite = new Database(":memory:");
sqlite.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL); INSERT INTO users (name) VALUES ('user 1'), ('user 2'), ('user 3')",
);
const onSqlite = createSql(
	sqliteDialect,
	new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) }),
);
export const sqliteRows = await collect(
	onSqlite("SELECT id, name FROM users WHERE id > $1 ORDER BY id", 1).stream(),
);

console.dir(
	{ rows, seen, afterBreak, inTransaction, withoutCursor, sqliteRows },
	{ depth: null },
);
