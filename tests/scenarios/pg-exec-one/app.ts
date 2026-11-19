import type { TooManyRowsError } from "@typesql/core";
import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL);
  INSERT INTO users VALUES (1, 'Ada'), (2, 'Grace');`);

const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => "resolved",
		({ name, message, text, count }: TooManyRowsError) => ({
			name,
			message,
			text,
			count,
		}),
	);

export const one = await sql(
	"SELECT id, name FROM users WHERE id = $1",
	1,
).execOne();
export const oneOrNone = await sql(
	"SELECT id, name FROM users WHERE id = $1",
	2,
).execOneOrNone();
export const none = await sql(
	"SELECT id, name FROM users WHERE id = $1",
	99,
).execOneOrNone();
export const latest = await sql(
	"SELECT id, name FROM users ORDER BY id DESC LIMIT 1",
).execOne();
const tooMany = await rejection(sql("SELECT id FROM users").execOne());
const tooManyOrNone = await rejection(
	sql("SELECT id FROM users ORDER BY id").execOneOrNone(),
);
// The deprecated methods still take the first row and ignore the rest.
export const first = await sql(
	"SELECT id, name FROM users ORDER BY id",
).execTakeFirst();
export const firstOrNone = await sql(
	"SELECT id, name FROM users ORDER BY id DESC",
).execTakeFirstOrNone();
await pool.end();

console.dir(
	{ one, oneOrNone, none, latest, tooMany, tooManyOrNone, first, firstOrNone },
	{ depth: null },
);
