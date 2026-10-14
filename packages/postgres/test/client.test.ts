import { describe, expect, test } from "vitest";
import type { Col, Generated, Nullable } from "typesql";
import {
  createBigIntSql,
  createSql,
  execute,
  many,
  maybeOne,
  one,
  query,
  transaction,
  migrate,
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

function rowList(rows: unknown[], count: number): PostgresJsRows {
  // postgres.js returns an Array with result metadata attached as properties.
  return Object.assign([...rows], { count, command: "SELECT" });
}

function fakeSql(rows: unknown[], count = rows.length) {
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
