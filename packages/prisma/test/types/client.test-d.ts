import { expectTypeOf, test } from "vitest";
import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Prisma, PrismaClient } from "../fixtures/client/client.js";
import { createSql, executeRaw, queryRaw, type PrismaRawClient } from "../../src/index.js";
import type { DB } from "../fixtures/typesql.js";

declare const prisma: PrismaClient;
const sql = createSql<DB>();

test("PrismaClient and its transaction client satisfy PrismaRawClient", () => {
  expectTypeOf<PrismaClient>().toExtend<PrismaRawClient>();
  expectTypeOf<Prisma.TransactionClient>().toExtend<PrismaRawClient>();
});

test("queryRaw returns typed rows as a PrismaPromise usable in $transaction([...])", () => {
  const q = queryRaw(prisma, sql('SELECT id, "bigNum" FROM "User" WHERE id = $1', 1));
  expectTypeOf(q).toEqualTypeOf<PrismaPromise<{ id: number; bigNum: bigint }[]>>();
  expectTypeOf(executeRaw(prisma, sql('DELETE FROM "User" WHERE id = $1', 1))).toEqualTypeOf<PrismaPromise<number>>();
  expectTypeOf(prisma.$transaction([q, executeRaw(prisma, sql("DELETE FROM posts"))])).toEqualTypeOf<Promise<[{ id: number; bigNum: bigint }[], number]>>();
});
