import { Pool } from "pg";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	type Col,
	createSql,
	type Generated,
	type Json,
	type Nullable,
	type RowType,
} from "../../src/index.js";
import { acquireDatabase } from "./db.js";

/**
 * Inline parameters, named parameters and fragments against a real Postgres through both
 * drivers: the statements the types accept must run, return what the types say, and keep
 * hostile input out of the SQL text.
 */
interface DB {
	inline_users: {
		id: Generated<"int4">;
		email: Col<"text">;
		age: Nullable<"int4">;
		tags: Generated<"text[]">;
		created_at: Generated<"timestamptz">;
	};
	inline_docs: {
		id: Generated<"int4">;
		items: Json<{ at: string; n: number }[]>;
		settings: Json<
			{ theme: string; tags: string[] },
			{ nullable: true },
			"json"
		>;
		label: Json<string, { nullable: true }>;
	};
}
const sql = createSql<DB>();

const db = await acquireDatabase();
type Run = (q: {
	text: string;
	values: readonly unknown[];
}) => Promise<Record<string, unknown>[]>;
const pool = db ? new Pool({ connectionString: db.url }) : null;
const pgjs = db ? postgres(db.url, { onnotice: () => {} }) : null;
const drivers: { name: string; run: Run }[] = db
	? [
			{
				name: "pg",
				run: async (q) => (await pool!.query(q.text, [...q.values])).rows,
			},
			{
				name: "postgres.js",
				run: async (q) =>
					[...(await pgjs!.unsafe(q.text, [...q.values] as never[]))] as Record<
						string,
						unknown
					>[],
			},
		]
	: [];

describe.skipIf(!db)("inline parameters against Postgres", () => {
	beforeAll(async () => {
		await pool!.query("DROP TABLE IF EXISTS inline_users");
		await pool!.query(`CREATE TABLE inline_users (
      id serial PRIMARY KEY, email text NOT NULL, age int, tags text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now())`);
		await pool!.query("DROP TABLE IF EXISTS inline_docs");
		await pool!.query(
			"CREATE TABLE inline_docs (id serial PRIMARY KEY, items jsonb NOT NULL, settings json, label jsonb)",
		);
	});
	afterAll(async () => {
		await pool?.query("DROP TABLE IF EXISTS inline_users");
		await pool?.query("DROP TABLE IF EXISTS inline_docs");
		await pool?.end();
		await pgjs?.end();
		await db?.close();
	});

	describe.each(drivers)("$name", ({ name, run }) => {
		test("insert, select and update with inline values", async () => {
			const email = `${name}@example.com`;
			const ins = sql(
				`INSERT INTO inline_users (email, age, tags) VALUES (${sql.param(email)}, ${sql.param(30)}, ${sql.param(["a", "b"])}) RETURNING id, tags`,
			);
			const [created] = (await run(ins)) as RowType<typeof ins>[];
			expect(created!.tags).toEqual(["a", "b"]);

			const sel = sql(
				`SELECT id, email, age FROM inline_users WHERE email = ${sql.param(email)} AND age >= ${sql.param(18)}`,
			);
			const rows = (await run(sel)) as RowType<typeof sel>[];
			expect(rows).toEqual([{ id: created!.id, email, age: 30 }]);

			const upd = sql(
				`UPDATE inline_users SET age = ${sql.param(null)} WHERE id = ${sql.param(created!.id)} RETURNING age`,
			);
			expect(await run(upd)).toEqual([{ age: null }]);
		});

		test("hostile input stays a value", async () => {
			const evil = "x'); DROP TABLE inline_users; --";
			const q = sql(
				`SELECT count(*) AS n FROM inline_users WHERE email = ${sql.param(evil)}`,
			);
			expect(q.text).not.toContain("DROP");
			expect(await run(q)).toEqual([{ n: "0" }]);
			const still = await run(sql("SELECT count(*) AS n FROM inline_users"));
			expect(Number(still[0]!["n"])).toBeGreaterThan(0);
		});

		test("sql.json() sends arrays, objects and strings as the same JSON in both drivers", async () => {
			const items = [
				{ at: "2024-01-02", n: 1 },
				{ at: "2024-01-03", n: 2.5 },
			];
			const settings = { theme: "dark", tags: ["a"] };
			const ins = sql(
				`INSERT INTO inline_docs (items, settings, label) VALUES (${sql.json(items)}, ${sql.json(settings)}, ${sql.json("it's")}) RETURNING id, items, settings, label`,
			);
			const [row] = (await run(ins)) as RowType<typeof ins>[];
			expect(row).toEqual({ id: row!.id, items, settings, label: "it's" });

			// the text Postgres stored is the JSON, not a Postgres array or a doubly encoded string
			const text = sql(
				`SELECT items::text AS items, label::text AS label, jsonb_typeof(items) AS kind, items -> -1 -> 'n' AS last_n FROM inline_docs WHERE id = ${sql.param(row!.id)}`,
			);
			const [stored] = await run(text);
			expect(JSON.parse(stored!["items"] as string)).toEqual(items);
			expect(stored).toEqual({
				items: stored!["items"],
				label: '"it\'s"',
				kind: "array",
				last_n: 2.5,
			});

			// null is SQL NULL
			const upd = sql(
				`UPDATE inline_docs SET settings = ${sql.json(null)}, label = ${sql.json(undefined)} WHERE id = ${sql.param(row!.id)} RETURNING settings IS NULL AS s, label IS NULL AS l`,
			);
			expect(await run(upd)).toEqual([{ s: true, l: true }]);
		});

		test("sql.json() as a positional, named or fragment argument", async () => {
			const items = [{ at: "2024-05-01", n: 7 }];
			const settings = { theme: "light", tags: ["b"] };
			const ins = sql(
				"INSERT INTO inline_docs (items, settings, label) VALUES ($1, $2, $3) RETURNING id, items, settings, label",
				sql.json(items),
				settings,
				sql.json("x"),
			);
			const [row] = (await run(ins)) as RowType<typeof ins>[];
			expect(row).toEqual({ id: row!.id, items, settings, label: "x" });

			const more = [...items, { at: "2024-05-02", n: 8 }];
			const upd = sql(
				"UPDATE inline_docs SET items = :items, settings = :settings WHERE id = :id RETURNING jsonb_typeof(items) AS kind, items -> -1 -> 'n' AS last, settings",
				{ items: sql.json(more), settings: sql.json(null), id: row!.id },
			);
			expect(await run(upd)).toEqual([
				{ kind: "array", last: 8, settings: null },
			]);

			const set = sql.fragment("items = $1", sql.json([]));
			const cleared = sql(
				"UPDATE inline_docs SET {set} WHERE id = $1 RETURNING jsonb_array_length(items) AS n",
				{ set },
				row!.id,
			);
			expect(await run(cleared)).toEqual([{ n: 0 }]);
		});

		test("ANY(array), dates, and mixing with named parameters and fragments", async () => {
			const recent = sql.fragment(`AND created_at > ${sql.param(new Date(0))}`);
			const q = sql(
				`SELECT count(*) AS n FROM inline_users WHERE email = ANY(${sql.param([`${name}@example.com`, "nobody"])}) AND id > :min {recent}`,
				{ recent },
				{ min: 0 },
			);
			expect(q.text).toBe(
				"SELECT count(*) AS n FROM inline_users WHERE email = ANY($2) AND id > $1 AND created_at > $3",
			);
			expect(await run(q)).toEqual([{ n: "1" }]);
		});
	});
});
