import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		doc: Json<Record<string, number>, { nullable: true }>;
	};
	accounts: { id: Col<"int4">; displayName: Col<"text", { nullable: true }> };
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, display_name text, doc jsonb);
CREATE TABLE accounts (id int PRIMARY KEY, "displayName" text);
INSERT INTO users (id, display_name, doc) VALUES (1, 'Ada', '{}')`);
const sql = createSql<DB>(pool);

const attempt = (name: string, write: () => void) => {
	try {
		write();
		console.log(name, "accepted");
	} catch (error) {
		console.log(
			name,
			"rejected:",
			error instanceof Error ? error.message : error,
		);
	}
};

const flat = sql.withPlugin(new CasePlugin());
const nested = sql.withPlugin(new CasePlugin({ nested: "all" }));
const snake = sql.withPlugin(new CasePlugin({ to: "snake_case" }));

attempt("sql.json", () => nested.json({ SASA: 1, sasa: 2 }));
attempt("sql.param", () => nested.param({ aB: 1, a_b: 2 }));
attempt("deep sql.json", () => nested.json([{ inner: { aB: 1, a_b: 2 } }]));
attempt("sql.set value", () => nested.set({ doc: { aB: 1, a_b: 2 } }));
attempt("sql.values value", () => nested.values([{ doc: { aB: 1, a_b: 2 } }]));
attempt("sql.set columns", () =>
	flat.set({ displayName: "a", display_name: "b" }),
);
attempt("sql.values columns", () =>
	flat.values([{ displayName: "a", display_name: "b" }]),
);
attempt("snake_case columns", () =>
	snake.set({ display_name: "a", displayName: "b" }),
);

// Without nested, values keep their keys, so theirs can't collide.
attempt("flat sql.json", () => flat.json({ aB: 1, a_b: 2 }));
attempt("flat sql.set value", () => flat.set({ doc: { aB: 1, a_b: 2 } }));
// Distinct keys are fine, in distinct objects too.
attempt("distinct", () => nested.json({ aB: 1, inner: { aB: 2 }, cD: 3 }));

// A row still takes the later of two columns that map to one key.
export const row = await flat(
	`SELECT 1 AS "displayName", 2 AS display_name`,
).executeTakeFirstOrThrow();
export const stored = await sql("SELECT id, doc FROM users").execute();

console.dir({ row, stored }, { depth: null });
await pool.end();
