import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import postgres from "postgres";
import { createSql, type Col, type Generated, type Nullable, type RowType } from "../../src/index.js";
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
}
const sql = createSql<DB>();

const db = await acquireDatabase();
type Run = (q: { text: string; values: readonly unknown[] }) => Promise<Record<string, unknown>[]>;
const pool = db ? new Pool({ connectionString: db.url }) : null;
const pgjs = db ? postgres(db.url, { onnotice: () => {} }) : null;
const drivers: { name: string; run: Run }[] = db
  ? [
      { name: "pg", run: async (q) => (await pool!.query(q.text, [...q.values])).rows },
      { name: "postgres.js", run: async (q) => [...(await pgjs!.unsafe(q.text, [...q.values] as never[]))] as Record<string, unknown>[] },
    ]
  : [];

describe.skipIf(!db)("inline parameters against Postgres", () => {
  beforeAll(async () => {
    await pool!.query("DROP TABLE IF EXISTS inline_users");
    await pool!.query(`CREATE TABLE inline_users (
      id serial PRIMARY KEY, email text NOT NULL, age int, tags text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now())`);
  });
  afterAll(async () => {
    await pool?.query("DROP TABLE IF EXISTS inline_users");
    await pool?.end();
    await pgjs?.end();
    await db?.close();
  });

  describe.each(drivers)("$name", ({ name, run }) => {
    test("insert, select and update with inline values", async () => {
      const email = `${name}@example.com`;
      const ins = sql(`INSERT INTO inline_users (email, age, tags) VALUES (${sql.param(email)}, ${sql.param(30)}, ${sql.param(["a", "b"])}) RETURNING id, tags`);
      const [created] = (await run(ins)) as RowType<typeof ins>[];
      expect(created!.tags).toEqual(["a", "b"]);

      const sel = sql(`SELECT id, email, age FROM inline_users WHERE email = ${sql.param(email)} AND age >= ${sql.param(18)}`);
      const rows = (await run(sel)) as RowType<typeof sel>[];
      expect(rows).toEqual([{ id: created!.id, email, age: 30 }]);

      const upd = sql(`UPDATE inline_users SET age = ${sql.param(null)} WHERE id = ${sql.param(created!.id)} RETURNING age`);
      expect(await run(upd)).toEqual([{ age: null }]);
    });

    test("hostile input stays a value", async () => {
      const evil = "x'); DROP TABLE inline_users; --";
      const q = sql(`SELECT count(*) AS n FROM inline_users WHERE email = ${sql.param(evil)}`);
      expect(q.text).not.toContain("DROP");
      expect(await run(q)).toEqual([{ n: "0" }]);
      const still = await run(sql("SELECT count(*) AS n FROM inline_users"));
      expect(Number(still[0]!["n"])).toBeGreaterThan(0);
    });

    test("ANY(array), dates, and mixing with named parameters and fragments", async () => {
      const recent = sql.fragment(`AND created_at > ${sql.param(new Date(0))}`);
      const q = sql(`SELECT count(*) AS n FROM inline_users WHERE email = ANY(${sql.param([`${name}@example.com`, "nobody"])}) AND id > :min {recent}`, { recent }, { min: 0 });
      expect(q.text).toBe("SELECT count(*) AS n FROM inline_users WHERE email = ANY($2) AND id > $1 AND created_at > $3");
      expect(await run(q)).toEqual([{ n: "1" }]);
    });
  });
});
