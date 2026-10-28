import type { Col, Generated } from "@typesql/core";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { acquireDatabase } from "../../core/test/conformance/db.js";
import { createSql, executor } from "../src/index.js";

/** Row counts as node-postgres reports them, and transactions, against a real Postgres (skipped without one; see core's `db.ts`). */
interface DB {
	count_pg: { id: Generated<"int4">; n: Col<"int4"> };
}

const db = await acquireDatabase();
const pool = db ? new Pool({ connectionString: db.url, max: 2 }) : null;
const sql = createSql<DB>(pool ?? undefined);

describe.skipIf(!db)("row counts against Postgres (pg)", () => {
	beforeAll(async () => {
		await pool!.query("DROP TABLE IF EXISTS count_pg");
		await pool!.query(
			"CREATE TABLE count_pg (id serial PRIMARY KEY, n int NOT NULL)",
		);
	});
	afterAll(async () => {
		await pool?.query("DROP TABLE IF EXISTS count_pg");
		await pool?.end();
		await db?.close();
	});

	test("reuses server statements across values and factories on one connection", async () => {
		const client = await pool!.connect();
		try {
			const bound = createSql<DB>(client);
			const text = "SELECT $1::int4 AS prepared_value";
			const bind = bound.prepare(text);
			expect(await bind(7).executeTakeFirstOrThrow()).toEqual({
				prepared_value: 7,
			});
			expect(await bind(8).executeTakeFirstOrThrow()).toEqual({
				prepared_value: 8,
			});
			expect(await bound.prepare(text)(9).executeCount()).toBe(1);
			const { rows } = await client.query(
				"SELECT name, generic_plans + custom_plans AS executions FROM pg_prepared_statements WHERE statement = $1",
				[text],
			);
			expect(rows).toEqual([
				{ name: expect.stringMatching(/^typesql_/), executions: "3" },
			]);
			expect(
				await bound
					.prepare("SELECT 42::int4 AS prepared_constant")()
					.executeTakeFirstOrThrow(),
			).toEqual({ prepared_constant: 42 });
			expect(
				await bound.transaction(async (tx) =>
					tx.prepare(text)(10).executeTakeFirstOrThrow(),
				),
			).toEqual({ prepared_value: 10 });
		} finally {
			client.release();
		}
	});

	test("executeCount reports the command tag's count", async () => {
		expect(
			await sql("INSERT INTO count_pg (n) VALUES (1), (2)").executeCount(),
		).toBe(2);
		expect(await sql("INSERT INTO count_pg (n) VALUES (3)").execute()).toEqual(
			[],
		);
		expect(
			await sql(
				"INSERT INTO count_pg (n) VALUES (4), (5) RETURNING id",
			).executeCount(),
		).toBe(2);

		// n: 1 2 3 4 5
		expect(
			await sql(
				"UPDATE count_pg SET n = n + 10 WHERE n > $1",
				2,
			).executeCount(),
		).toBe(3);
		expect(
			await sql("UPDATE count_pg SET n = 0 WHERE n < $1", 0).executeCount(),
		).toBe(0);
		expect(await sql("SELECT id FROM count_pg").executeCount()).toBe(5);
		// n: 1 2 13 14 15
		expect(
			await sql(
				"DELETE FROM count_pg WHERE n > $1 RETURNING n",
				14,
			).executeCount(),
		).toBe(1);
		expect(
			await sql("DELETE FROM count_pg WHERE n > $1", 12).executeCount(),
		).toBe(2);
		// n: 1 2
		expect(
			await sql
				.as<never>("CREATE TEMP TABLE count_pg_tmp (x int)")
				.executeCount(),
		).toBe(0);
		expect(
			await sql.as<never>("DROP TABLE IF EXISTS count_pg_tmp").executeCount(),
		).toBe(0);
	});

	test("MERGE counts the rows it changed", async () => {
		const merge = sql.as<never>(
			"MERGE INTO count_pg t USING (VALUES (1), (2)) AS s(n) ON t.n = s.n WHEN MATCHED THEN UPDATE SET n = t.n",
		);
		expect(await merge.executeCount()).toBe(2);
	});

	test("executeCount on a transaction's client", async () => {
		const client = await pool!.connect();
		try {
			await client.query("BEGIN");
			expect(
				await sql("SELECT id FROM count_pg").executeCount(executor(client)),
			).toBe(2);
			expect(
				await createSql<DB>(client)("DELETE FROM count_pg").executeCount(),
			).toBe(2);
			await client.query("ROLLBACK");
		} finally {
			client.release();
		}
	});

	test("sql.transaction commits, rolls back on error, and nests with savepoints", async () => {
		const ns = async () =>
			(await sql("SELECT n FROM count_pg ORDER BY n").execute()).map(
				(r) => r.n,
			);
		expect(await ns()).toEqual([1, 2]);

		const id = await sql.transaction(async (tx) => {
			const { id } = await tx(
				"INSERT INTO count_pg (n) VALUES ($1) RETURNING id",
				3,
			).executeTakeFirstOrThrow();
			// the pool's other connection does not see the row until COMMIT
			expect(await ns()).toEqual([1, 2]);
			return id;
		});
		expect(typeof id).toBe("number");
		expect(await ns()).toEqual([1, 2, 3]);

		await expect(
			sql.transaction(async (tx) => {
				await tx("DELETE FROM count_pg").execute();
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await ns()).toEqual([1, 2, 3]);

		await sql.transaction(async (tx) => {
			await tx("INSERT INTO count_pg (n) VALUES ($1)", 4).execute();
			await expect(
				tx.transaction(async (inner) => {
					await inner("INSERT INTO count_pg (n) VALUES ($1)", 5).execute();
					throw new Error("inner");
				}),
			).rejects.toThrow("inner");
			await tx.transaction((inner) =>
				inner("INSERT INTO count_pg (n) VALUES ($1)", 6).execute(),
			);
		});
		expect(await ns()).toEqual([1, 2, 3, 4, 6]);
	});
});
