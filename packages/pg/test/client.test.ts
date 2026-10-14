import { describe, expect, test } from "vitest";
import type { Col, Generated, Nullable } from "typesql";
import {
  createSql,
  execute,
  many,
  maybeOne,
  one,
  query,
  transaction,
  migrate,
  RowCountError,
  type PgPoolLike,
  type PgQueryable,
  type PgTransactionClient,
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
  values: unknown[] | undefined;
}

function fakeClient(rows: unknown[], rowCount: number | null = rows.length) {
  const calls: Call[] = [];
  const client: PgQueryable = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows, rowCount };
    },
  };
  return { client, calls };
}

const rowA = { id: 7, email: "a@example.com", display_name: null };
const rowB = { id: 8, email: "b@example.com", display_name: "B" };

describe("createSql", () => {
  test("builds { text, values }", () => {
    expect(q.text).toBe("SELECT id, email, display_name FROM users WHERE id = $1");
    expect(q.values).toEqual([7]);
    const raw = sql.as<{ n: number }>("SELECT 1 AS n");
    expect(raw).toEqual({ text: "SELECT 1 AS n", values: [] });
  });
});

describe("query", () => {
  test("passes text and a mutable copy of the values, returns the rows", async () => {
    const { client, calls } = fakeClient([rowA, rowB]);
    const rows = await query(client, q);
    expect(rows).toEqual([rowA, rowB]);
    expect(calls).toEqual([{ text: q.text, values: [7] }]);
    expect(calls[0]?.values).not.toBe(q.values);
  });
});

describe("one", () => {
  test("returns the single row", async () => {
    const { client } = fakeClient([rowA]);
    await expect(one(client, q)).resolves.toEqual(rowA);
  });

  test("throws NO_ROWS on an empty result", async () => {
    const { client } = fakeClient([]);
    const err = await one(client, q).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RowCountError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: "RowCountError", code: "NO_ROWS", expected: "exactly 1", actual: 0, text: q.text });
    expect((err as Error).message).toBe("Expected exactly 1 row(s) but the query returned 0");
  });

  test("throws TOO_MANY_ROWS on more than one row", async () => {
    const { client } = fakeClient([rowA, rowB]);
    await expect(one(client, q)).rejects.toMatchObject({ code: "TOO_MANY_ROWS", actual: 2 });
  });
});

describe("maybeOne", () => {
  test("returns null for no rows", async () => {
    const { client } = fakeClient([]);
    await expect(maybeOne(client, q)).resolves.toBeNull();
  });

  test("returns the row for one row", async () => {
    const { client } = fakeClient([rowB]);
    await expect(maybeOne(client, q)).resolves.toEqual(rowB);
  });

  test("throws TOO_MANY_ROWS for more than one row", async () => {
    const { client } = fakeClient([rowA, rowB]);
    await expect(maybeOne(client, q)).rejects.toMatchObject({ code: "TOO_MANY_ROWS", expected: "at most 1", actual: 2 });
  });
});

describe("many", () => {
  test("returns all rows when there is at least one", async () => {
    const { client } = fakeClient([rowA, rowB]);
    await expect(many(client, q)).resolves.toEqual([rowA, rowB]);
  });

  test("throws NO_ROWS on an empty result", async () => {
    const { client } = fakeClient([]);
    await expect(many(client, q)).rejects.toMatchObject({ code: "NO_ROWS", expected: "at least 1", actual: 0 });
  });
});

describe("execute", () => {
  test("returns rowCount", async () => {
    const { client, calls } = fakeClient([], 3);
    const del = sql.as<never>("DELETE FROM users WHERE id = $1", 7);
    await expect(execute(client, del)).resolves.toBe(3);
    expect(calls).toEqual([{ text: "DELETE FROM users WHERE id = $1", values: [7] }]);
  });

  test("maps a null rowCount to 0", async () => {
    const { client } = fakeClient([], null);
    await expect(execute(client, sql.as<never>("CREATE TABLE t (x int)"))).resolves.toBe(0);
  });
});

describe("transaction", () => {
  function fakePool(opts: { failOn?: string; rows?: unknown[] } = {}) {
    const log: string[] = [];
    const releases: (Error | boolean | undefined)[] = [];
    let connects = 0;
    const client: PgTransactionClient = {
      async query(text) {
        log.push(text);
        if (text === opts.failOn) throw new Error(`${text} failed`);
        return { rows: opts.rows ?? [], rowCount: 0 };
      },
      release(err) {
        releases.push(err);
      },
    };
    const pool: PgPoolLike = {
      async connect() {
        connects++;
        return client;
      },
    };
    return { pool, client, log, releases, connects: () => connects };
  }

  test("BEGIN, callback, COMMIT, release()", async () => {
    const p = fakePool({ rows: [rowA] });
    const result = await transaction(p.pool, async (client) => {
      expect(client).toBe(p.client);
      return one(client, q);
    });
    expect(result).toEqual(rowA);
    expect(p.log).toEqual(["BEGIN", q.text, "COMMIT"]);
    expect(p.releases).toEqual([undefined]);
    expect(p.connects()).toBe(1);
  });

  test("ROLLBACK and rethrow when the callback throws", async () => {
    const p = fakePool();
    const boom = new Error("boom");
    await expect(
      transaction(p.pool, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(p.log).toEqual(["BEGIN", "ROLLBACK"]);
    expect(p.releases).toEqual([undefined]);
  });

  test("ROLLBACK and rethrow when COMMIT fails", async () => {
    const p = fakePool({ failOn: "COMMIT" });
    await expect(transaction(p.pool, async () => 1)).rejects.toThrow("COMMIT failed");
    expect(p.log).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(p.releases).toEqual([undefined]);
  });

  test("releases the client with the error when ROLLBACK fails, still rethrows the original", async () => {
    const p = fakePool({ failOn: "ROLLBACK" });
    const boom = new Error("boom");
    await expect(
      transaction(p.pool, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(p.log).toEqual(["BEGIN", "ROLLBACK"]);
    expect(p.releases).toHaveLength(1);
    expect(p.releases[0]).toBeInstanceOf(Error);
    expect((p.releases[0] as Error).message).toBe("ROLLBACK failed");
  });

  test("releases the client when BEGIN fails and does not COMMIT or ROLLBACK", async () => {
    const p = fakePool({ failOn: "BEGIN" });
    await expect(transaction(p.pool, async () => 1)).rejects.toThrow("BEGIN failed");
    expect(p.log).toEqual(["BEGIN"]);
    expect(p.releases).toEqual([undefined]);
  });
});

describe("migrate", () => {
  function fakePool(failOn?: string) {
    const log: string[] = [];
    const releases: unknown[] = [];
    const client: PgTransactionClient = {
      async query(text) {
        log.push(text);
        if (text === failOn) throw new Error(`${text} failed`);
        return { rows: [], rowCount: 0 };
      },
      release(err) {
        releases.push(err);
      },
    };
    const pool: PgPoolLike = { connect: async () => client };
    return { pool, log, releases };
  }
  const m = { statements: ["CREATE TABLE a (id int)", "CREATE TABLE b (id int)"] };

  test("runs every statement in order inside one transaction", async () => {
    const f = fakePool();
    await migrate(f.pool, m);
    expect(f.log).toEqual(["BEGIN", "CREATE TABLE a (id int)", "CREATE TABLE b (id int)", "COMMIT"]);
    expect(f.releases).toEqual([undefined]);
  });

  test("rolls back and rethrows when a statement fails", async () => {
    const f = fakePool("CREATE TABLE b (id int)");
    await expect(migrate(f.pool, m)).rejects.toThrow("CREATE TABLE b (id int) failed");
    expect(f.log).toEqual(["BEGIN", "CREATE TABLE a (id int)", "CREATE TABLE b (id int)", "ROLLBACK"]);
  });
});
