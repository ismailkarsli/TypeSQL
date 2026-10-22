import { expect, test } from "vitest";
import type { PrismaPromise } from "@prisma/client/runtime/client";
import { createSql, executor, type PrismaRawClient } from "../src/index.js";

interface DB {
  users: { id: { type: "int4"; nullable: false; hasDefault: true }; email: { type: "text"; nullable: false; hasDefault: false } };
}

function fakeClient(calls: unknown[][], opts: { failOn?: string } = {}): Required<PrismaRawClient> {
  const promise = <T>(value: T) => Promise.resolve(value) as PrismaPromise<T>;
  const tx: PrismaRawClient = {
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => (calls.push(["query", query, ...values]), promise([{ id: 1 }] as T)),
    $executeRawUnsafe: (query: string, ...values: unknown[]) => {
      calls.push(["execute", query, ...values]);
      return (query === opts.failOn ? Promise.reject(new Error(`${query} failed`)) : promise(3)) as PrismaPromise<number>;
    },
  };
  return {
    ...tx,
    async $transaction(fn) {
      calls.push(["BEGIN"]);
      try {
        const result = await fn(tx);
        calls.push(["COMMIT"]);
        return result;
      } catch (err) {
        calls.push(["ROLLBACK"]);
        throw err;
      }
    },
  };
}

test("execute* run through $queryRawUnsafe, executeCount through $executeRawUnsafe, with the values as bind parameters", async () => {
  const calls: unknown[][] = [];
  const prisma = fakeClient(calls);
  const sql = createSql<DB>(prisma);
  expect(await sql("SELECT id FROM users WHERE email = :email", { email: "a@b.c" }).executeTakeFirst()).toEqual({ id: 1 });
  expect(await sql(`DELETE FROM users WHERE id = ${sql.param(7)}`).executeCount()).toBe(3);
  expect(await createSql<DB>()("SELECT id FROM users").execute(executor(prisma))).toEqual([{ id: 1 }]);
  expect(calls).toEqual([
    ["query", "SELECT id FROM users WHERE email = $1", "a@b.c"],
    ["execute", "DELETE FROM users WHERE id = $1", 7],
    ["query", "SELECT id FROM users"],
  ]);
});

test("sql.transaction runs the callback in prisma.$transaction with a sql bound to the transaction client", async () => {
  const calls: unknown[][] = [];
  const sql = createSql<DB>(fakeClient(calls));
  expect(await sql.transaction((tx) => tx("SELECT id FROM users").execute())).toEqual([{ id: 1 }]);
  const boom = new Error("boom");
  await expect(
    sql.transaction(async () => {
      throw boom;
    }),
  ).rejects.toBe(boom);
  expect(calls).toEqual([["BEGIN"], ["query", "SELECT id FROM users"], ["COMMIT"], ["BEGIN"], ["ROLLBACK"]]);
});

test("tx.transaction, and transaction on a transaction client, use savepoints", async () => {
  const calls: unknown[][] = [];
  const sql = createSql<DB>(fakeClient(calls));
  const boom = new Error("boom");
  await sql.transaction(async (tx) => {
    await tx.transaction((inner) => inner("SELECT id FROM users").execute());
    await expect(
      tx.transaction(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
  expect(calls).toEqual([
    ["BEGIN"],
    ["execute", "SAVEPOINT typesql_2"],
    ["query", "SELECT id FROM users"],
    ["execute", "RELEASE SAVEPOINT typesql_2"],
    ["execute", "SAVEPOINT typesql_2"],
    ["execute", "ROLLBACK TO SAVEPOINT typesql_2"],
    ["COMMIT"],
  ]);

  const txCalls: unknown[][] = [];
  const { $transaction: _, ...txClient } = fakeClient(txCalls, { failOn: "RELEASE SAVEPOINT typesql_1" });
  await expect(createSql<DB>(txClient).transaction(async () => 1)).rejects.toThrow("RELEASE SAVEPOINT typesql_1 failed");
  expect(txCalls).toEqual([
    ["execute", "SAVEPOINT typesql_1"],
    ["execute", "RELEASE SAVEPOINT typesql_1"],
    ["execute", "ROLLBACK TO SAVEPOINT typesql_1"],
  ]);
});

test("rowKeys: camelCase queries run through q.execute(executor(prisma))", async () => {
  const { createSql: createCoreSql } = await import("@typesql/core");
  const calls: unknown[][] = [];
  const camel = createCoreSql<DB>(executor(fakeClient(calls)), { rowKeys: "camelCase" });
  expect(await camel("SELECT id FROM users").execute()).toEqual([{ id: 1 }]);
});

test("sql.transaction rejects without a client", async () => {
  await expect(createSql<DB>().transaction(async () => 1)).rejects.toThrow(/no client/);
});
