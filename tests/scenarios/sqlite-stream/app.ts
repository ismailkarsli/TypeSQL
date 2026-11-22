import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";
import Database from "better-sqlite3";

interface DB {
	users: { id: Col<"integer">; name: Col<"text"> };
}
const schema = `CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL);
  INSERT INTO users VALUES (1, 'user 1'), (2, 'user 2'), (3, 'user 3'), (4, 'user 4'), (5, 'user 5');`;

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

async function run(db: Database.Database | DatabaseSync) {
	db.exec(schema);
	const sql = createSql<DB>(db);
	const rows = await collect(
		sql("SELECT id, name FROM users WHERE id > $1 ORDER BY id", 1).stream({
			batchSize: 2,
		}),
	);
	const prepared = sql.prepare("SELECT name FROM users WHERE id = $1");
	const preparedRows = [
		...(await collect(prepared(4).stream())),
		...(await collect(prepared(5).stream())),
	];
	// Stopping early resets the statement.
	let seen = 0;
	for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
		batchSize: 1,
	})) {
		if (++seen === 2) break;
	}
	const afterBreak = await sql("SELECT count(*) AS n FROM users").execOne();
	// A statement without rows runs and yields none.
	const inserted = await collect(
		sql("INSERT INTO users VALUES ($1, $2)", 6, "user 6").stream(),
	);
	const returning = await collect(
		sql(
			"INSERT INTO users VALUES ($1, $2) RETURNING id, name",
			7,
			"user 7",
		).stream(),
	);
	const inTransaction = await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id > $1", 3).exec();
		return collect(tx("SELECT id FROM users ORDER BY id").stream());
	});
	// Other statements run while a stream is open.
	let during = "";
	for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
		batchSize: 1,
	})) {
		during = await message(sql("SELECT count(*) AS n FROM users").exec());
		break;
	}
	return {
		rows,
		preparedRows,
		seen,
		afterBreak,
		inserted,
		returning,
		inTransaction,
		during,
	};
}

export const betterSqlite3 = await run(new Database(process.env.SQLITE_PATH!));
export const nodeSqlite = await run(new DatabaseSync(":memory:"));

console.dir({ betterSqlite3, nodeSqlite }, { depth: null });
