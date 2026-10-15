import { describe, expect, test } from "vitest";
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { createSql, execute, executor, query } from "../src/index.js";
import type { DB } from "./fixtures/kysely-codegen.js";

/** A Kysely instance whose driver records each query and answers with `result`. */
function fakeKysely(result: QueryResult<unknown>) {
  const calls: { sql: string; parameters: readonly unknown[] }[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(cq: CompiledQuery): Promise<QueryResult<R>> {
      calls.push({ sql: cq.sql, parameters: cq.parameters });
      return result as QueryResult<R>;
    },
    async *streamQuery() {},
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() { return connection; },
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
  return { db, calls };
}

const sql = createSql<DB>();

describe("createSql", () => {
  test("is core's createSql at runtime", () => {
    const q = sql("SELECT id, email FROM users WHERE id = :id AND mood = :mood", { id: 7, mood: "happy" });
    expect(q.text).toBe("SELECT id, email FROM users WHERE id = $1 AND mood = $2");
    expect(q.values).toEqual([7, "happy"]);
  });
});

describe("query / execute", () => {
  test("query sends text and values and returns rows untouched by plugins", async () => {
    const { db, calls } = fakeKysely({ rows: [{ id: 1, display_name: "Ada" }] });
    const rows = await query(db, sql("SELECT id, display_name FROM users WHERE id = $1", 1));
    expect(calls).toEqual([{ sql: "SELECT id, display_name FROM users WHERE id = $1", parameters: [1] }]);
    // CamelCasePlugin is installed but bypassed: keys stay as Postgres returns them
    expect(rows).toEqual([{ id: 1, display_name: "Ada" }]);
  });

  test("works inside a transaction", async () => {
    const { db, calls } = fakeKysely({ rows: [{ id: 2 }] });
    const rows = await db.transaction().execute((trx) => query(trx, sql("SELECT id FROM users")));
    expect(rows).toEqual([{ id: 2 }]);
    expect(calls.map((c) => c.sql)).toContain("SELECT id FROM users");
  });

  test("execute returns numAffectedRows as a number", async () => {
    const { db } = fakeKysely({ rows: [], numAffectedRows: 3n });
    await expect(execute(db, sql("DELETE FROM posts WHERE author_id = $1", 1))).resolves.toBe(3);
    const none = fakeKysely({ rows: [] });
    await expect(execute(none.db, sql("DELETE FROM posts"))).resolves.toBe(0);
  });
});

describe("executor", () => {
  test("runs the queries' execute methods on the bound instance, bypassing plugins", async () => {
    const { db, calls } = fakeKysely({ rows: [{ id: 1, display_name: "Ada" }] });
    const bound = createSql<DB>(db);
    expect(await bound("SELECT id, display_name FROM users WHERE id = $1", 1).executeTakeFirstOrThrow()).toEqual({ id: 1, display_name: "Ada" });
    expect(calls).toEqual([{ sql: "SELECT id, display_name FROM users WHERE id = $1", parameters: [1] }]);
  });

  test("executor(trx) can be passed per call inside a transaction", async () => {
    const { db } = fakeKysely({ rows: [{ id: 2 }] });
    const rows = await db.transaction().execute((trx) => sql("SELECT id FROM users").execute(executor(trx)));
    expect(rows).toEqual([{ id: 2 }]);
  });
});
