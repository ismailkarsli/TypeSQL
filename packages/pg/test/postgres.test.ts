import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import type { Col, Generated } from "@typesql/core";
import { acquireDatabase } from "../../core/test/conformance/db.js";
import { createSql, execute, executor } from "../src/index.js";

/** Row counts as node-postgres reports them, against a real Postgres (skipped without one; see core's `db.ts`). */
interface DB {
  count_pg: { id: Generated<"int4">; n: Col<"int4"> };
}

const db = await acquireDatabase();
const pool = db ? new Pool({ connectionString: db.url, max: 2 }) : null;
const sql = createSql<DB>(pool ?? undefined);

describe.skipIf(!db)("row counts against Postgres (pg)", () => {
  beforeAll(async () => {
    await pool!.query("DROP TABLE IF EXISTS count_pg");
    await pool!.query("CREATE TABLE count_pg (id serial PRIMARY KEY, n int NOT NULL)");
  });
  afterAll(async () => {
    await pool?.query("DROP TABLE IF EXISTS count_pg");
    await pool?.end();
    await db?.close();
  });

  test("executeCount and execute(client, q) report the command tag's count", async () => {
    expect(await sql("INSERT INTO count_pg (n) VALUES (1), (2)").executeCount()).toBe(2);
    expect(await sql("INSERT INTO count_pg (n) VALUES (3)").execute()).toEqual([]);
    expect(await sql("INSERT INTO count_pg (n) VALUES (4), (5) RETURNING id").executeCount()).toBe(2);

    // n: 1 2 3 4 5
    expect(await sql("UPDATE count_pg SET n = n + 10 WHERE n > $1", 2).executeCount()).toBe(3);
    expect(await sql("UPDATE count_pg SET n = 0 WHERE n < $1", 0).executeCount()).toBe(0);
    expect(await sql("SELECT id FROM count_pg").executeCount()).toBe(5);
    // n: 1 2 13 14 15
    expect(await sql("DELETE FROM count_pg WHERE n > $1 RETURNING n", 14).executeCount()).toBe(1);
    expect(await execute(pool!, sql("DELETE FROM count_pg WHERE n > $1", 12))).toBe(2);
    // n: 1 2
    expect(await sql.as<never>("CREATE TEMP TABLE count_pg_tmp (x int)").executeCount()).toBe(0);
    expect(await sql.as<never>("DROP TABLE IF EXISTS count_pg_tmp").executeCount()).toBe(0);
  });

  test("MERGE counts the rows it changed", async () => {
    const merge = sql.as<never>("MERGE INTO count_pg t USING (VALUES (1), (2)) AS s(n) ON t.n = s.n WHEN MATCHED THEN UPDATE SET n = t.n");
    expect(await merge.executeCount()).toBe(2);
  });

  test("executeCount on a transaction's client", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      expect(await execute(client, sql("SELECT id FROM count_pg"))).toBe(2);
      expect(await sql("DELETE FROM count_pg").executeCount(executor(client))).toBe(2);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
