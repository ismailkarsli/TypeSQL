import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Enum } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import pg from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text">;
		mood: Enum<"mood">;
	};
	$types: { mood: "happy" | "sad" };
}
const url = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, max: 2 });
await pool.query(`CREATE TYPE mood AS ENUM ('happy', 'sad');
  CREATE TABLE users (id int PRIMARY KEY, display_name text NOT NULL, mood mood NOT NULL);
  INSERT INTO users SELECT i, 'user ' || i, CASE WHEN i % 2 = 0 THEN 'happy'::mood ELSE 'sad' END
  FROM generate_series(1, 5) i;`);
const sql = createSql<DB>(pool);

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

// Rows arrive in batches of two, typed as exec() types them.
export const rows = await collect(
	sql(
		"SELECT id, display_name, mood FROM users WHERE id > $1 ORDER BY id",
		1,
	).stream({ batchSize: 2 }),
);
// Arrays of enums are parsed as exec() parses them.
export const moods = await collect(
	sql(
		"SELECT id, array_agg(mood ORDER BY mood) AS moods FROM users GROUP BY id ORDER BY id LIMIT 2",
	).stream(),
);
// Output plugins apply to every row.
export const camel = await collect(
	sql
		.withPlugin(new CasePlugin())
		.prepare("SELECT id, display_name FROM users WHERE id = $1")(3)
		.stream(),
);
// Rows of a statement that changes data.
export const updated = await collect(
	sql(
		"UPDATE users SET display_name = upper(display_name) WHERE id <= 2 RETURNING id, display_name",
	).stream(),
);

// Stopping early closes the cursor and gives the client back to the pool.
let seen = 0;
for await (const _ of sql("SELECT id FROM users ORDER BY id").stream({
	batchSize: 1,
})) {
	if (++seen === 2) break;
}
const afterBreak = { seen, total: pool.totalCount, idle: pool.idleCount };

// A failed statement rejects the iteration and frees its client too.
const failed = await message(
	collect(sql("SELECT 1 / (id - 3) AS n FROM users ORDER BY id").stream()),
);
const afterFailure = { total: pool.totalCount, idle: pool.idleCount };

// In a transaction, rows come from its connection and see its changes.
const inTransaction = await sql.transaction(async (tx) => {
	await tx("DELETE FROM users WHERE id > $1", 3).exec();
	return collect(tx("SELECT id FROM users ORDER BY id").stream());
});
const ended = await sql.transaction(async (tx) => tx);
const afterEnd = await message(collect(ended("SELECT 1 AS n").stream()));

// A single client looks up array types on itself, which the cursor holds.
const client = new pg.Client({ connectionString: url });
await client.connect();
const single = createSql<DB>(client);
const lookup = await message(
	collect(single("SELECT ARRAY['sad']::mood[] AS moods").stream()),
);
await single("SELECT ARRAY['sad']::mood[] AS moods").exec();
export const looked = await collect(
	single("SELECT ARRAY['happy', 'sad']::mood[] AS moods").stream(),
);
export const enums = await collect(
	single("SELECT mood FROM users ORDER BY id").stream(),
);
await client.end();
await pool.end();

console.dir(
	{
		rows,
		moods,
		camel,
		updated,
		afterBreak,
		failed,
		afterFailure,
		inTransaction,
		afterEnd,
		lookup,
		looked,
		enums,
	},
	{ depth: null },
);
