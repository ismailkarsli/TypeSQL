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
