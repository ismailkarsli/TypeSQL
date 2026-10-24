import type { DefaultTypeMap } from "@typesql/core";
import { type Generated, Kysely, sql as ksql, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { acquireDatabase } from "../../core/test/conformance/db.js";
import { createSql, executor } from "../src/index.js";

/** Row counts as Kysely's `PostgresDialect` reports them, and transactions, against a real Postgres (skipped without one; see core's `db.ts`). */
interface DB {
	count_kysely: { id: Generated<number>; n: number };
}

const db = await acquireDatabase();
const kdb = db
	? new Kysely<DB>({
			dialect: new PostgresDialect({
				pool: new Pool({ connectionString: db.url, max: 2 }),
			}),
		})
	: null;
const sql = createSql<
	DB,
	DefaultTypeMap,
	{ count_kysely: { id: "int4"; n: "int4" } }
>(kdb ?? undefined);

describe.skipIf(!db)("row counts against Postgres (kysely)", () => {
	beforeAll(async () => {
		await ksql`DROP TABLE IF EXISTS count_kysely`.execute(kdb!);
		await ksql`CREATE TABLE count_kysely (id serial PRIMARY KEY, n int NOT NULL)`.execute(
			kdb!,
		);
	});
	afterAll(async () => {
		if (kdb) await ksql`DROP TABLE IF EXISTS count_kysely`.execute(kdb);
		await kdb?.destroy();
		await db?.close();
	});

	test("executeCount reports the command tag's count", async () => {
		expect(
			await sql("INSERT INTO count_kysely (n) VALUES (1), (2)").executeCount(),
		).toBe(2);
		expect(
			await sql("INSERT INTO count_kysely (n) VALUES (3)").execute(),
		).toEqual([]);
		expect(
			await sql(
				"INSERT INTO count_kysely (n) VALUES (4), (5) RETURNING id",
			).executeCount(),
		).toBe(2);

		// n: 1 2 3 4 5
		expect(
			await sql(
				"UPDATE count_kysely SET n = n + 10 WHERE n > $1",
				2,
			).executeCount(),
		).toBe(3);
		expect(
			await sql("UPDATE count_kysely SET n = 0 WHERE n < $1", 0).executeCount(),
		).toBe(0);
		expect(await sql("SELECT id FROM count_kysely").executeCount()).toBe(5);
		// n: 1 2 13 14 15
		expect(
			await sql(
				"DELETE FROM count_kysely WHERE n > $1 RETURNING n",
				14,
			).executeCount(),
		).toBe(1);
		expect(
			await sql("DELETE FROM count_kysely WHERE n > $1", 12).executeCount(),
		).toBe(2);
		// n: 1 2; DDL: no numAffectedRows and no rows
		expect(
			await sql
				.as<never>("CREATE TABLE count_kysely_tmp (x int)")
				.executeCount(),
		).toBe(0);
		expect(
			await sql.as<never>("DROP TABLE count_kysely_tmp").executeCount(),
		).toBe(0);
	});

	test("MERGE counts the rows it changed", async () => {
		const merge = sql.as<never>(
			"MERGE INTO count_kysely t USING (VALUES (1), (2)) AS s(n) ON t.n = s.n WHEN MATCHED THEN UPDATE SET n = t.n",
		);
		expect(await merge.executeCount()).toBe(2);
	});

	test("executeCount inside a transaction", async () => {
		await kdb!.transaction().execute(async (trx) => {
			expect(
				await createSql<
					DB,
					DefaultTypeMap,
					{ count_kysely: { id: "int4"; n: "int4" } }
				>(trx)("SELECT id FROM count_kysely").executeCount(),
			).toBe(2);
			expect(
				await sql("DELETE FROM count_kysely").executeCount(executor(trx)),
			).toBe(2);
		});
		expect(await sql("SELECT id FROM count_kysely").execute()).toEqual([]);
	});

	test("sql.transaction commits, rolls back on error, and nests with savepoints", async () => {
		const ns = async () =>
			(await sql("SELECT n FROM count_kysely ORDER BY n").execute()).map(
				(r) => r.n,
			);
		await sql.transaction(async (tx) => {
			await tx(
				"INSERT INTO count_kysely (n) VALUES ($1), ($2)",
				1,
				2,
			).execute();
			expect(await ns()).toEqual([]);
		});
		expect(await ns()).toEqual([1, 2]);

		await expect(
			sql.transaction(async (tx) => {
				await tx("DELETE FROM count_kysely").execute();
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await ns()).toEqual([1, 2]);

		await sql.transaction(async (tx) => {
			await expect(
				tx.transaction(async (inner) => {
					await inner("INSERT INTO count_kysely (n) VALUES ($1)", 3).execute();
					throw new Error("inner");
				}),
			).rejects.toThrow("inner");
			await tx.transaction((inner) =>
				inner("INSERT INTO count_kysely (n) VALUES ($1)", 4).execute(),
			);
		});
		expect(await ns()).toEqual([1, 2, 4]);
	});
});
