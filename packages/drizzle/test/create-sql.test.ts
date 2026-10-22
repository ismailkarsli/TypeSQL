import { describe, expect, test } from "vitest";
import { getTableConfig, timestamp } from "drizzle-orm/pg-core";
import { createSql, executor, pgType, type DrizzleDatabase } from "../src/index.js";
import * as schema from "./fixtures/schema.js";

describe("createSql", () => {
  const sql = createSql<typeof schema>();

  test("builds { text, values }", () => {
    const q = sql("SELECT id, email FROM users WHERE mood = $1 AND id > $2", "happy", 1);
    expect(q.text).toBe("SELECT id, email FROM users WHERE mood = $1 AND id > $2");
    expect(q.values).toEqual(["happy", 1]);
  });

  test("named parameters and fragments work as in core", () => {
    const where = sql.fragment("WHERE a.user_id = :id", { id: 7 });
    const q = sql("SELECT a.id FROM auth.accounts a {where} LIMIT $1", { where }, 10);
    expect(q.text).toBe("SELECT a.id FROM auth.accounts a WHERE a.user_id = $2 LIMIT $1");
    expect(q.values).toEqual([10, 7]);
  });
});

/** A Drizzle database whose session holds `client`, as `drizzle(client)` sets it up. */
function fakeDb(client: object): DrizzleDatabase {
  return { _: { session: { client } }, transaction: async (fn) => fn(fakeDb(client)) };
}

describe("executor", () => {
  test("node-postgres clients: query(text, values), rows and rowCount", async () => {
    const calls: unknown[][] = [];
    const client = { query: async (text: string, values: unknown[]) => (calls.push([text, values]), { rows: [{ id: 1 }], rowCount: 1 }) };
    const sql = createSql<typeof schema>(fakeDb(client));
    const q = sql("SELECT id FROM users WHERE id = $1", 1);
    expect(await q.execute()).toEqual([{ id: 1 }]);
    expect(await q.executeCount()).toBe(1);
    expect(calls).toEqual([[q.text, [1]], [q.text, [1]]]);
    expect(calls[0]![1]).not.toBe(q.values);
  });

  test("postgres.js clients: unsafe(text, values), the rows without metadata, and count", async () => {
    const client = { unsafe: async () => Object.assign([{ id: 1 }], { count: 1, command: "SELECT" }) };
    const q = createSql<typeof schema>(fakeDb(client))("SELECT id FROM users");
    const rows = await q.execute();
    expect(rows).toEqual([{ id: 1 }]);
    expect(rows).not.toHaveProperty("count");
    await expect(q.executeCount()).resolves.toBe(1);
  });

  test("rejects a session client without query or unsafe, and sql.transaction without a db", async () => {
    await expect(executor(fakeDb({}))("SELECT 1", [])).rejects.toThrow(/node-postgres or postgres.js/);
    await expect(createSql<typeof schema>().transaction(async () => 1)).rejects.toThrow(/no client/);
  });

  test("sql.transaction runs in db.transaction with a sql bound to the transaction", async () => {
    const outer = { query: async () => ({ rows: [{ where: "outer" }], rowCount: 1 }) };
    const inner = { query: async () => ({ rows: [{ where: "tx" }], rowCount: 1 }) };
    const db: DrizzleDatabase = { _: { session: { client: outer } }, transaction: async (fn) => fn(fakeDb(inner)) };
    const sql = createSql<typeof schema>(db);
    expect(await sql.transaction((tx) => tx.as<{ where: string }>("SELECT 1").execute())).toEqual([{ where: "tx" }]);
  });
});

describe("pgType", () => {
  test("returns the builder unchanged", () => {
    const builder = timestamp("at", { withTimezone: true });
    expect(pgType(builder, "timestamptz")).toBe(builder);
  });

  test("the fixture schema is valid Drizzle", () => {
    const users = getTableConfig(schema.users);
    expect(users.name).toBe("users");
    expect(users.columns.find((c) => c.name === "created_at")?.getSQLType()).toBe("timestamp with time zone");
    expect(getTableConfig(schema.accounts).schema).toBe("auth");
  });
});
