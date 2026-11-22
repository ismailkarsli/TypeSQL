import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql/mariadb";
import mariadb from "mariadb";

interface DB {
	users: { id: Col<"int">; name: Col<"varchar"> };
}
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
	const all: T[] = [];
	for await (const row of rows) all.push(row);
	return all;
}
const code = (promise: Promise<unknown>) =>
	promise.then(
		() => "resolved",
		(error: Error & { code?: string }) => error.code,
	);

// One connection: a stream that kept it would block every later query.
const pool = mariadb.createPool(
	`${process.env.DATABASE_URL}?connectionLimit=1`,
);
await pool.query(
	"CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL)",
);
await pool.query(
	"INSERT INTO users VALUES (1, 'user 1'), (2, 'user 2'), (3, 'user 3'), (4, 'user 4'), (5, 'user 5')",
);

const sqlOnPool = createSql<DB>(pool);

async function run(sql: typeof sqlOnPool) {
	const rows = await collect(
		sql("SELECT id, name FROM users WHERE id > $1 ORDER BY id", 1).stream({
			batchSize: 2,
		}),
	);
	const prepared = await collect(
		sql.prepare("SELECT name FROM users WHERE id = $1")(4).stream(),
	);
	let seen = 0;
	for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
		batchSize: 1,
	})) {
		if (++seen === 2) break;
	}
	// The rest of the rows were skipped, and the connection is free again.
	const afterBreak = await sql("SELECT count(*) AS n FROM users").execOne();
	const updated = await collect(
		sql("UPDATE users SET name = name WHERE id = $1", 1).stream(),
	);
	const failed = await code(
		collect(sql("INSERT INTO users VALUES ($1, $2)", 1, "again").stream()),
	);
	const inTransaction = await sql.transaction(async (tx) => {
		await tx("UPDATE users SET name = upper(name) WHERE id = $1", 2).exec();
		return collect(
			tx("SELECT id, name FROM users WHERE id <= 2 ORDER BY id").stream(),
		);
	});
	return { rows, prepared, seen, afterBreak, updated, failed, inTransaction };
}

export const onPool = await run(sqlOnPool);
const connection = await mariadb.createConnection(process.env.DATABASE_URL!);
export const onConnection = await run(createSql<DB>(connection));
await connection.end();
await pool.end();

console.dir({ onPool, onConnection }, { depth: null });
