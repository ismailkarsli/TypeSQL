import { describe, expect, it } from "vitest";
import { createSql, NoResultError, type Col, type Executor, type Generated } from "../../src/index.js";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text"> };
}

function fakeExecutor(rows: readonly unknown[]) {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const executor: Executor = async (text, values) => {
    calls.push({ text, values });
    return rows;
  };
  return { executor, calls };
}

const rowA = { id: 1, email: "a@b.c" };
const rowB = { id: 2, email: "d@e.f" };

describe("execute", () => {
  it("runs the query on the executor bound by createSql", async () => {
    const { executor, calls } = fakeExecutor([rowA, rowB]);
    const sql = createSql<DB>(executor);
    const q = sql("SELECT id, email FROM users WHERE id > $1", 0);
    expect(await q.execute()).toEqual([rowA, rowB]);
    expect(calls).toEqual([{ text: "SELECT id, email FROM users WHERE id > $1", values: [0] }]);
  });

  it("prefers an executor passed to the call", async () => {
    const bound = fakeExecutor([rowA]);
    const given = fakeExecutor([rowB]);
    const sql = createSql<DB>(bound.executor);
    expect(await sql("SELECT id, email FROM users").execute(given.executor)).toEqual([rowB]);
    expect(bound.calls).toEqual([]);
  });

  it("works on sql.as queries and returns a fresh array", async () => {
    const rows = [rowA];
    const { executor } = fakeExecutor(rows);
    const sql = createSql<DB>(executor);
    const result = await sql.as<{ id: number }>("SELECT id FROM users").execute();
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it("rejects when there is no executor", async () => {
    const sql = createSql<DB>();
    await expect(sql("SELECT id FROM users").execute()).rejects.toThrow(/no executor/);
  });

  it("stays a plain { text, values } object", () => {
    const sql = createSql<DB>(fakeExecutor([]).executor);
    expect(sql("SELECT id FROM users WHERE id = $1", 7)).toStrictEqual({ text: "SELECT id FROM users WHERE id = $1", values: [7] });
  });
});

describe("executeTakeFirst", () => {
  it("returns the first row or undefined", async () => {
    const sql = createSql<DB>();
    const q = sql("SELECT id, email FROM users");
    expect(await q.executeTakeFirst(fakeExecutor([rowA, rowB]).executor)).toEqual(rowA);
    expect(await q.executeTakeFirst(fakeExecutor([]).executor)).toBeUndefined();
  });
});

describe("executeTakeFirstOrThrow", () => {
  it("returns the first row", async () => {
    const sql = createSql<DB>(fakeExecutor([rowA, rowB]).executor);
    expect(await sql("SELECT id, email FROM users").executeTakeFirstOrThrow()).toEqual(rowA);
  });

  it("throws NoResultError with the query text when there are no rows", async () => {
    const sql = createSql<DB>(fakeExecutor([]).executor);
    const err = await sql("SELECT id FROM users").executeTakeFirstOrThrow().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoResultError);
    expect(err).toMatchObject({ name: "NoResultError", text: "SELECT id FROM users" });
  });
});

describe("{ rows, rowCount } executors", () => {
  function countingExecutor(rows: readonly unknown[], rowCount: number | null) {
    const executor: Executor = async () => ({ rows, rowCount });
    return executor;
  }

  it("execute* read the rows of a { rows, rowCount } result", async () => {
    const sql = createSql<DB>(countingExecutor([rowA, rowB], 2));
    const q = sql("SELECT id, email FROM users");
    expect(await q.execute()).toEqual([rowA, rowB]);
    expect(await q.executeTakeFirst()).toEqual(rowA);
    expect(await q.executeTakeFirstOrThrow()).toEqual(rowA);
    await expect(q.executeTakeFirstOrThrow(countingExecutor([], 0))).rejects.toBeInstanceOf(NoResultError);
  });

  it("execute returns a fresh mutable array", async () => {
    const rows = Object.freeze([rowA]);
    const result = await createSql<DB>(countingExecutor(rows, 1))("SELECT id, email FROM users").execute();
    expect(result).toEqual([rowA]);
    expect(result).not.toBe(rows);
    expect(Object.isFrozen(result)).toBe(false);
  });
});

describe("executeCount", () => {
  it("returns the executor's rowCount, with or without rows", async () => {
    const sql = createSql<DB>(async () => ({ rows: [], rowCount: 3 }));
    expect(await sql("DELETE FROM users WHERE id > $1", 0).executeCount()).toBe(3);
    const returning: Executor = async () => ({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });
    expect(await sql("DELETE FROM users RETURNING id").executeCount(returning)).toBe(2);
  });

  it("reads a null rowCount (a statement without a count) as 0", async () => {
    const sql = createSql<DB>(async () => ({ rows: [], rowCount: null }));
    expect(await sql.as<never>("CREATE TABLE t (x int)").executeCount()).toBe(0);
  });

  it("rejects when the executor resolves to rows alone", async () => {
    const sql = createSql<DB>(fakeExecutor([rowA]).executor);
    await expect(sql("SELECT id FROM users").executeCount()).rejects.toThrow(/did not report a row count/);
    const missing = (async () => ({ rows: [] })) as unknown as Executor;
    await expect(sql("SELECT id FROM users").executeCount(missing)).rejects.toThrow(/did not report a row count/);
  });

  it("runs the executor's count method instead when it has one", async () => {
    const calls: unknown[] = [];
    const exec: Executor = Object.assign(async () => [rowA], {
      count: async (text: string, values: readonly unknown[]) => (calls.push({ text, values }), 4),
    });
    const sql = createSql<DB>(exec);
    expect(await sql("DELETE FROM users WHERE id > $1", 0).executeCount()).toBe(4);
    expect(await sql("SELECT id FROM users").execute()).toEqual([rowA]);
    expect(calls).toEqual([{ text: "DELETE FROM users WHERE id > $1", values: [0] }]);
  });

  it("sends the text and values, and rejects without an executor", async () => {
    const calls: unknown[] = [];
    const sql = createSql<DB>();
    const exec: Executor = async (text, values) => {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 };
    };
    expect(await sql("UPDATE users SET email = $1 WHERE id = $2", "x", 1).executeCount(exec)).toBe(1);
    expect(calls).toEqual([{ text: "UPDATE users SET email = $1 WHERE id = $2", values: ["x", 1] }]);
    await expect(sql("DELETE FROM users").executeCount()).rejects.toThrow(/no executor/);
  });
});
