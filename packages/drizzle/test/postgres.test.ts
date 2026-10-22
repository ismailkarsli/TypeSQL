import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { integer, pgTable, serial, timestamp, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import { Pool } from "pg";
import postgres from "postgres";
import { acquireDatabase } from "../../core/test/conformance/db.js";
import { createSql } from "../src/index.js";

/** Queries and transactions on Drizzle databases, against a real Postgres (skipped without one; see core's `db.ts`). */
const schema = {
  counts: pgTable("count_drizzle", {
    id: serial().primaryKey(),
    n: integer().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
};

const db = await acquireDatabase();
const pool = db ? new Pool({ connectionString: db.url, max: 2 }) : null;
const pgjs = db ? postgres(db.url, { max: 2, onnotice: () => {} }) : null;
const drivers: [string, PgDatabase<PgQueryResultHKT, typeof schema> | null][] = [
  ["node-postgres", pool && drizzleNodePg(pool, { schema })],
  ["postgres.js", pgjs && drizzlePostgresJs(pgjs, { schema })],
];

describe.skipIf(!db).each(drivers)("Drizzle on %s", (_name, ddb) => {
  const sql = createSql<typeof schema>(ddb!);
  const ns = async () => (await sql("SELECT n FROM count_drizzle ORDER BY n").execute()).map((r) => r.n);

  beforeAll(async () => {
    await sql.as<never>("DROP TABLE IF EXISTS count_drizzle").execute();
    await sql.as<never>("CREATE TABLE count_drizzle (id serial PRIMARY KEY, n int NOT NULL, at timestamptz NOT NULL DEFAULT now())").execute();
  });
  afterAll(async () => {
    await sql.as<never>("DROP TABLE IF EXISTS count_drizzle").execute();
  });

  test("execute* and executeCount run on the driver client", async () => {
    expect(await sql("INSERT INTO count_drizzle (n) VALUES ($1), ($2)", 1, 2).executeCount()).toBe(2);
    expect(await sql("SELECT n FROM count_drizzle WHERE n > $1", 1).execute()).toEqual([{ n: 2 }]);
    expect(await sql("UPDATE count_drizzle SET n = n WHERE n > $1", 0).executeCount()).toBe(2);
    expect(await sql("SELECT id FROM count_drizzle").executeCount()).toBe(2);
    expect(await sql.as<never>("CREATE TEMP TABLE count_drizzle_tmp (x int)").executeCount()).toBe(0);
  });

  test("timestamps are parsed as the driver parses them", async () => {
    const { at } = await sql("SELECT at FROM count_drizzle LIMIT 1").executeTakeFirstOrThrow();
    // drizzle-orm/postgres-js turns postgres.js' date parsers off on the client it is given
    if (_name === "node-postgres") expect(at).toBeInstanceOf(Date);
    else expect(typeof at).toBe("string");
  });

  test("sql.transaction commits, rolls back on error, and nests with savepoints", async () => {
    await sql.transaction(async (tx) => {
      await tx("INSERT INTO count_drizzle (n) VALUES ($1)", 3).execute();
      expect(await ns()).toEqual([1, 2]);
    });
    expect(await ns()).toEqual([1, 2, 3]);

    await expect(
      sql.transaction(async (tx) => {
        await tx("DELETE FROM count_drizzle").execute();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await ns()).toEqual([1, 2, 3]);

    await sql.transaction(async (tx) => {
      await expect(
        tx.transaction(async (inner) => {
          await inner("INSERT INTO count_drizzle (n) VALUES ($1)", 4).execute();
          throw new Error("inner");
        }),
      ).rejects.toThrow("inner");
      await tx.transaction((inner) => inner("INSERT INTO count_drizzle (n) VALUES ($1)", 5).execute());
    });
    expect(await ns()).toEqual([1, 2, 3, 5]);
  });

  test("createSql(tx) inside a Drizzle transaction runs on its connection", async () => {
    await expect(
      ddb!.transaction(async (tx) => {
        await tx.insert(schema.counts).values({ n: 6 });
        expect(await createSql<typeof schema>(tx)("SELECT n FROM count_drizzle WHERE n = $1", 6).execute()).toEqual([{ n: 6 }]);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await ns()).toEqual([1, 2, 3, 5]);
  });
});

afterAll(async () => {
  await pool?.end();
  await pgjs?.end();
  await db?.close();
});
