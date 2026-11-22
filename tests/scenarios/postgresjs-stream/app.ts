import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/postgres";
import postgres from "postgres";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
}
// One connection: a stream that kept it would block every later query.
const client = postgres(process.env.DATABASE_URL!, {
	max: 1,
	onnotice: () => {},
});
await client.unsafe(`CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL);
  INSERT INTO users SELECT i, 'user ' || i FROM generate_series(1, 5) i;`);
const sql = createSql<DB>(client);

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

export const rows = await collect(
	sql("SELECT id, name FROM users WHERE id > $1 ORDER BY id", 1).stream({
		batchSize: 2,
	}),
);
// A statement without parameters streams too.
export const all = await collect(
	sql("SELECT count(*) AS n FROM users").stream(),
);
export const prepared = await collect(
	sql.prepare("SELECT name FROM users WHERE id = $1")(4).stream(),
);

let seen = 0;
for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
	batchSize: 1,
})) {
	if (++seen === 2) break;
}
// The connection is free again.
const afterBreak = await sql("SELECT count(*) AS n FROM users").execOne();

const failed = await message(
	collect(sql("SELECT 1 / (id - 3) AS n FROM users ORDER BY id").stream()),
);

const inTransaction = await sql.transaction(async (tx) => {
	await tx("DELETE FROM users WHERE id > $1", 3).exec();
	return collect(tx("SELECT id FROM users ORDER BY id").stream());
});
await client.end();

console.dir(
	{ rows, all, prepared, seen, afterBreak, failed, inTransaction },
	{ depth: null },
);
