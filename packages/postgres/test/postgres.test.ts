import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import type { Col, Generated } from "@typesql/core";
import { acquireDatabase } from "../../core/test/conformance/db.js";
import { createSql, execute, executor, transaction } from "../src/index.js";

/** Row counts as postgres.js reports them, against a real Postgres (skipped without one; see core's `db.ts`). */
interface DB {
  count_pgjs: { id: Generated<"int4">; n: Col<"int4"> };
}

const db = await acquireDatabase();
const pgjs = db ? postgres(db.url, { max: 2, onnotice: () => {} }) : null;
const sql = createSql<DB>(pgjs ?? undefined);

describe.skipIf(!db)("row counts against Postgres (postgres.js)", () => {
  beforeAll(async () => {
    await pgjs!.unsafe("DROP TABLE IF EXISTS count_pgjs");
    await pgjs!.unsafe("CREATE TABLE count_pgjs (id serial PRIMARY KEY, n int NOT NULL)");
  });
  afterAll(async () => {
    await pgjs?.unsafe("DROP TABLE IF EXISTS count_pgjs");
    await pgjs?.end();
    await db?.close();
  });

  test("executeCount and execute(sql, q) report the command tag's count", async () => {
    expect(await sql("INSERT INTO count_pgjs (n) VALUES (1), (2)").executeCount()).toBe(2);
    expect(await sql("INSERT INTO count_pgjs (n) VALUES (3)").execute()).toEqual([]);
    expect(await sql("INSERT INTO count_pgjs (n) VALUES (4), (5) RETURNING id").executeCount()).toBe(2);

    // n: 1 2 3 4 5
    expect(await sql("UPDATE count_pgjs SET n = n + 10 WHERE n > $1", 2).executeCount()).toBe(3);
    expect(await sql("UPDATE count_pgjs SET n = 0 WHERE n < $1", 0).executeCount()).toBe(0);
    expect(await sql("SELECT id FROM count_pgjs").executeCount()).toBe(5);
    // n: 1 2 13 14 15
    expect(await sql("DELETE FROM count_pgjs WHERE n > $1 RETURNING n", 14).executeCount()).toBe(1);
    expect(await execute(pgjs!, sql("DELETE FROM count_pgjs WHERE n > $1", 12))).toBe(2);
    // n: 1 2; DDL has no count (postgres.js' `count` is null)
    expect(await sql.as<never>("CREATE TABLE count_pgjs_tmp (x int)").executeCount()).toBe(0);
    expect(await execute(pgjs!, sql.as<never>("DROP TABLE count_pgjs_tmp"))).toBe(0);
  });

  test("MERGE counts the rows it changed", async () => {
    const merge = sql.as<never>("MERGE INTO count_pgjs t USING (VALUES (1), (2)) AS s(n) ON t.n = s.n WHEN MATCHED THEN UPDATE SET n = t.n");
    expect(await merge.executeCount()).toBe(2);
  });

  test("executeCount inside a transaction", async () => {
    await transaction(pgjs!, async (tx) => {
      expect(await execute(tx, sql("SELECT id FROM count_pgjs"))).toBe(2);
      expect(await sql("DELETE FROM count_pgjs").executeCount(executor(tx))).toBe(2);
    });
    expect(await sql("SELECT id FROM count_pgjs").execute()).toEqual([]);
  });
});
