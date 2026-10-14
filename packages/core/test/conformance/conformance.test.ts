import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import postgres from "postgres";
import { corpus, schema, type ConformanceCase, type TypeofName } from "./corpus.js";
import { acquireDatabase } from "./db.js";

/**
 * Runs the corpus against a real Postgres through both drivers and checks, per statement, that
 * the returned row object has exactly `expectKeys` (in order) and that `typeof` of each value
 * matches `expectTypes`. Skips (does not fail) when no database can be obtained; see `db.ts`.
 */

interface Exec {
  readonly rows: Record<string, unknown>[];
  /** Column names as reported by the driver (may contain duplicates). */
  readonly columns: string[];
}

interface Driver {
  readonly name: string;
  exec(sql: string, params: readonly unknown[]): Promise<Exec>;
  close(): Promise<void>;
}

function pgDriver(url: string): Driver {
  const pool = new Pool({ connectionString: url, max: 2 });
  return {
    name: "pg",
    async exec(sql, params) {
      const result = await pool.query(sql, [...params]);
      return { rows: result.rows as Record<string, unknown>[], columns: result.fields.map((f) => f.name) };
    },
    close: () => pool.end(),
  };
}

function postgresJsDriver(url: string): Driver {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  return {
    name: "postgres.js",
    async exec(text, params) {
      const result = await sql.unsafe(text, [...params] as never[]);
      // `columns` is absent for statements without a result set (DDL in `setup`).
      return { rows: Array.from(result) as Record<string, unknown>[], columns: (result.columns ?? []).map((c) => c.name) };
    },
    close: () => sql.end(),
  };
}

function typeofName(value: unknown): TypeofName {
  return value === null ? "null" : (typeof value as TypeofName);
}

const acquireStarted = performance.now();
const db = await acquireDatabase();
if (db) console.info(`[conformance] Postgres from ${db.source} at ${db.url} (${Math.round(performance.now() - acquireStarted)} ms)`);
const drivers: Driver[] = db ? [pgDriver(db.url), postgresJsDriver(db.url)] : [];

describe.skipIf(!db)("conformance against Postgres", () => {
  beforeAll(async () => {
    const admin = drivers[0]!;
    for (const statement of schema) await admin.exec(statement, []);
  }, 60_000);

  afterAll(async () => {
    for (const driver of drivers) await driver.close();
    await db?.close();
  }, 60_000);

  describe.each(drivers)("$name", (driver) => {
    test.each(corpus as readonly ConformanceCase[])("$name", async (c) => {
      for (const statement of c.setup) await driver.exec(statement, []);
      const { rows, columns } = await driver.exec(c.sql, c.params);

      // Duplicate names collapse into one key on the row object (last value wins).
      expect([...new Set(columns)]).toEqual([...c.expectKeys]);
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0]!;
      expect(Object.keys(row)).toEqual([...c.expectKeys]);

      const actualTypes = Object.fromEntries(c.expectKeys.map((key) => [key, typeofName(row[key])]));
      expect(actualTypes).toEqual(c.expectTypes);
    });
  });
});
