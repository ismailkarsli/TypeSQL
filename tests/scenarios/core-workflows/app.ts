import { Pool } from "pg";
import {
	createSql,
	CasePlugin,
	type IdentityPluginTypes,
	type SqlPlugin,
} from "@typesql/core";
import { postgres } from "@typesql/core/postgres";
import { mapRows } from "@typesql/core/adapter";
import { executor } from "@typesql/pg";
import type { Col } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		balance: Col<"int4">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(postgres, executor(pool));
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, display_name text, balance int NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', 100), (2, NULL, 50)`);
const where = sql.fragment("WHERE id >= $1", 1);
const condition = true;
const optional = condition ? sql.fragment("AND balance > $1", 0) : undefined;
const query = sql(
	`SELECT id, display_name FROM users ${where} ${sql.optional(optional)} ORDER BY ${sql.id("id")}`,
);
export const rows = await query.execute();
export const named = await sql(
	"SELECT id FROM users WHERE id = :id OR id = :id",
	{ id: 1 },
).execute();
export const inline = await sql(
	`SELECT id FROM users WHERE id = ${sql.param(2)}`,
).execute();
export const text = query.text;
export const values = query.values;
const unbound = createSql<DB>(postgres);
const rawQuery = unbound("SELECT id FROM users ORDER BY id");
export const mapped = mapRows(
	rawQuery,
	(await pool.query(rawQuery.text, [...rawQuery.values])).rows,
);
export const overridden = await rawQuery.execute(executor(pool));
type Box<T> = { data: T };
interface Wrapped extends IdentityPluginTypes {
	readonly output: Box<this["value"]>;
}
class Wrapper implements SqlPlugin<Wrapped> {
	declare readonly types?: Wrapped;
	transformOutput(row: unknown): unknown {
		return { data: row };
	}
}
const transformed = sql.withPlugin(new CasePlugin()).withPlugin(new Wrapper());
export const wrapped = await transformed(
	"SELECT display_name FROM users WHERE id = $1",
	1,
).executeTakeFirstOrThrow();
console.dir(
	{ rows, named, inline, text, values, mapped, overridden, wrapped },
	{ depth: null },
);
await pool.end();
