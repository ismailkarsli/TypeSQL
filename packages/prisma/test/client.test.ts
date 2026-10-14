import { expect, test } from "vitest";
import type { PrismaPromise } from "@prisma/client/runtime/client";
import { createSql, executeRaw, queryRaw, type PrismaRawClient } from "../src/index.js";

interface DB {
  users: { id: { type: "int4"; nullable: false; hasDefault: true }; email: { type: "text"; nullable: false; hasDefault: false } };
}

function fakeClient(calls: unknown[][]): PrismaRawClient {
  const promise = <T>(value: T) => Promise.resolve(value) as PrismaPromise<T>;
  return {
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => (calls.push(["query", query, ...values]), promise([{ id: 1 }] as T)),
    $executeRawUnsafe: (query: string, ...values: unknown[]) => (calls.push(["execute", query, ...values]), promise(3)),
  };
}

test("queryRaw and executeRaw pass the text and bind values to Prisma's raw methods", async () => {
  const sql = createSql<DB>();
  const calls: unknown[][] = [];
  const prisma = fakeClient(calls);
  expect(await queryRaw(prisma, sql("SELECT id FROM users WHERE email = :email", { email: "a@b.c" }))).toEqual([{ id: 1 }]);
  expect(await executeRaw(prisma, sql(`DELETE FROM users WHERE id = ${sql.param(7)}`))).toBe(3);
  expect(calls).toEqual([
    ["query", "SELECT id FROM users WHERE email = $1", "a@b.c"],
    ["execute", "DELETE FROM users WHERE id = $1", 7],
  ]);
});
