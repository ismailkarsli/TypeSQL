import { describe, expect, test } from "vitest";
import type { Col, ExecutorResult, Generated, Nullable } from "@typesql/core";
import {
  createBigIntSql,
  createSql,
  execute,
  executor,
  many,
  maybeOne,
  one,
  query,
  transaction,
  migrate,
  NoResultError,
  RowCountError,
  type PostgresJsQueryable,
  type PostgresJsRows,
  type PostgresJsTransactable,
} from "../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
  };
}

const sql = createSql<DB>();
const q = sql("SELECT id, email, display_name FROM users WHERE id = $1", 7);

interface Call {
  text: string;
  params: unknown[] | undefined;
}

function rowList(rows: unknown[], count: number | null): PostgresJsRows {
  // postgres.js returns an Array with result metadata attached as properties.
  return Object.assign([...rows], { count, command: "SELECT" });
}

function fakeSql(rows: unknown[], count: number | null = rows.length) {
  const calls: Call[] = [];
  const log: string[] = [];
  const tx: PostgresJsQueryable = {
    async unsafe(text, params) {
      calls.push({ text, params });
      log.push(text);
      return rowList(rows, count);
    },
  };
  const client: PostgresJsQueryable & PostgresJsTransactable = {
    unsafe: tx.unsafe,
    async begin(fn) {
      log.push("BEGIN");
      try {
        const result = await fn(tx);
        log.push("COMMIT");
        return result;
      } catch (err) {
        log.push("ROLLBACK");
        throw err;
      }
    },
  };
  return { client, tx, calls, log };
}

const rowA = { id: 7, email: "a@example.com", display_name: null };
const rowB = { id: 8, email: "b@example.com", display_name: "B" };

describe("createSql / createBigIntSql", () => {
  test("build { text, values }", () => {
    expect(q.text).toBe("SELECT id, email, display_name FROM users WHERE id = $1");
    expect(q.values).toEqual([7]);
    const big = createBigIntSql<DB>();
    expect(big("SELECT count(*) FROM users")).toEqual({ text: "SELECT count(*) FROM users", values: [] });
    expect(sql.as<{ n: number }>("SELECT 1 AS n")).toEqual({ text: "SELECT 1 AS n", values: [] });
  });
});

describe("query", () => {
  test("calls unsafe(text, params) with a mutable copy and returns a plain array of rows", async () => {
    const { client, calls } = fakeSql([rowA, rowB]);
    const rows = await query(client, q);
    expect(rows).toEqual([rowA, rowB]);
    expect(Array.isArray(rows)).toBe(true);
    expect("count" in rows).toBe(false);
    expect(calls).toEqual([{ text: q.text, params: [7] }]);
    expect(calls[0]?.params).not.toBe(q.values);
  });
});

describe("one", () => {
  test("returns the single row", async () => {
    const { client } = fakeSql([rowA]);
    await expect(one(client, q)).resolves.toEqual(rowA);
  });

  test("throws NO_ROWS on an empty result", async () => {
    const { client } = fakeSql([]);
    const err = await one(client, q).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RowCountError);
    expect(err).toMatchObject({ name: "RowCountError", code: "NO_ROWS", expected: "exactly 1", actual: 0, text: q.text });
  });

  test("throws TOO_MANY_ROWS on more than one row", async () => {
    const { client } = fakeSql([rowA, rowB]);
    await expect(one(client, q)).rejects.toMatchObject({ code: "TOO_MANY_ROWS", actual: 2 });
  });
});

describe("maybeOne", () => {
  test("null for no rows, the row for one row, throws for more", async () => {
    await expect(maybeOne(fakeSql([]).client, q)).resolves.toBeNull();
    await expect(maybeOne(fakeSql([rowB]).client, q)).resolves.toEqual(rowB);
    await expect(maybeOne(fakeSql([rowA, rowB]).client, q)).rejects.toMatchObject({ code: "TOO_MANY_ROWS", expected: "at most 1", actual: 2 });
  });
});

describe("many", () => {
  test("returns all rows when there is at least one, throws on none", async () => {
    await expect(many(fakeSql([rowA, rowB]).client, q)).resolves.toEqual([rowA, rowB]);
    await expect(many(fakeSql([]).client, q)).rejects.toMatchObject({ code: "NO_ROWS", expected: "at least 1", actual: 0 });
  });
});

describe("execute", () => {
  test("returns the result's count", async () => {
    const { client, calls } = fakeSql([], 4);
    const del = sql.as<never>("DELETE FROM users WHERE id = $1", 7);
    await expect(execute(client, del)).resolves.toBe(4);
    expect(calls).toEqual([{ text: "DELETE FROM users WHERE id = $1", params: [7] }]);
  });

  test("maps a null count (DDL) to 0", async () => {
    await expect(execute(fakeSql([], null).client, sql.as<never>("CREATE TABLE t (x int)"))).resolves.toBe(0);
  });
});

describe("transaction", () => {
  test("runs the callback inside begin() with the transaction sql and returns its result", async () => {
    const f = fakeSql([rowA]);
    const result = await transaction(f.client, async (tx) => {
      expect(tx).toBe(f.tx);
      return one(tx, q);
    });
    expect(result).toEqual(rowA);
    expect(f.log).toEqual(["BEGIN", q.text, "COMMIT"]);
  });

  test("propagates the callback's error after begin() rolls back", async () => {
    const f = fakeSql([]);
    const boom = new Error("boom");
    await expect(
      transaction(f.client, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(f.log).toEqual(["BEGIN", "ROLLBACK"]);
  });
});

describe("migrate", () => {
  const m = { statements: ["CREATE TABLE a (id int)", "CREATE TABLE b (id int)"] };

  test("runs every statement in order inside begin() without parameters", async () => {
    const f = fakeSql([]);
    await migrate(f.client, m);
    expect(f.log).toEqual(["BEGIN", "CREATE TABLE a (id int)", "CREATE TABLE b (id int)", "COMMIT"]);
    expect(f.calls.map((c) => c.params)).toEqual([undefined, undefined]);
  });

  test("rolls back and rethrows when a statement fails", async () => {
    const f = fakeSql([]);
    const failing = { ...f.client, unsafe: f.client.unsafe };
    f.tx.unsafe = async (text: string) => {
      f.log.push(text);
      if (text.includes(" b ")) throw new Error("boom");
      return [] as never;
    };
    await expect(migrate(failing, m)).rejects.toThrow("boom");
    expect(f.log).toEqual(["BEGIN", "CREATE TABLE a (id int)", "CREATE TABLE b (id int)", "ROLLBACK"]);
  });
});

describe("executor", () => {
  test("runs the queries' execute methods through unsafe and strips result metadata", async () => {
    const { client, calls } = fakeSql([{ id: 7 }]);
    const bound = createSql<DB>(client);
    const rows = await bound("SELECT id FROM users WHERE id = $1", 7).execute();
    expect(rows).toEqual([{ id: 7 }]);
    expect(rows).not.toHaveProperty("count");
    expect(calls).toEqual([{ text: "SELECT id FROM users WHERE id = $1", params: [7] }]);
    expect(await createBigIntSql<DB>(client)("SELECT id FROM users").executeTakeFirstOrThrow()).toEqual({ id: 7 });
  });

  test("executor(sql) can be passed per call", async () => {
    const { client } = fakeSql([]);
    await expect(q.executeTakeFirstOrThrow(executor(client))).rejects.toBeInstanceOf(NoResultError);
  });

  test("resolves to { rows, rowCount }, so executeCount reports postgres.js' count", async () => {
    const result = (await executor(fakeSql([rowA], 1).client)("SELECT 1", [])) as ExecutorResult;
    expect(result).toEqual({ rows: [rowA], rowCount: 1 });
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows).not.toHaveProperty("count");
    await expect(sql("DELETE FROM users WHERE id = $1", 7).executeCount(executor(fakeSql([], 3).client))).resolves.toBe(3);
    await expect(sql.as<never>("CREATE TABLE t (x int)").executeCount(executor(fakeSql([], null).client))).resolves.toBe(0);
  });
});

describe("rowKeys: camelCase", () => {
  test("execute* and the helpers return camelCase keys, without result metadata", async () => {
    const raw = { id: 7, display_name: "A", meta_data: { inner_key: 1 } };
    const { client } = fakeSql([raw]);
    const expected = { id: 7, displayName: "A", metaData: { inner_key: 1 } };
    const cq = createSql<DB>(client, { rowKeys: "camelCase" })("SELECT id, display_name FROM users WHERE id = $1", 7);
    const rows = await cq.execute();
    expect(rows).toEqual([expected]);
    expect(rows).not.toHaveProperty("count");
    expect(await query(client, cq)).toEqual([expected]);
    expect(await one(client, cq)).toEqual(expected);
    const big = createBigIntSql<DB>(client, { rowKeys: "camelCase" });
    expect(await big("SELECT display_name FROM users").executeTakeFirst()).toEqual(expected);
  });
});
