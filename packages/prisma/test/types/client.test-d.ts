import { expectTypeOf, test } from "vitest";
import type { Prisma, PrismaClient } from "../fixtures/client/client.js";
import { createSql, type PrismaRawClient, type PrismaSql } from "../../src/index.js";
import type { DB } from "../fixtures/typesql.js";

declare const prisma: PrismaClient;
const sql = createSql<DB>(prisma);

test("PrismaClient and its transaction client satisfy PrismaRawClient", () => {
  expectTypeOf<PrismaClient>().toExtend<PrismaRawClient>();
  expectTypeOf<Prisma.TransactionClient>().toExtend<PrismaRawClient>();
});

test("execute* and transaction type rows from the query", () => {
  const q = sql('SELECT id, "bigNum" FROM "User" WHERE id = $1', 1);
  expectTypeOf(q.execute()).toEqualTypeOf<Promise<{ id: number; bigNum: bigint }[]>>();
  expectTypeOf(sql('DELETE FROM "User" WHERE id = $1', 1).executeCount()).toEqualTypeOf<Promise<number>>();
  const result = sql.transaction(async (tx) => {
    expectTypeOf(tx).toEqualTypeOf<PrismaSql<DB>>();
    return tx('SELECT id, "bigNum" FROM "User" WHERE id = $1', 1).executeTakeFirstOrThrow();
  });
  expectTypeOf(result).toEqualTypeOf<Promise<{ id: number; bigNum: bigint }>>();
  createSql<DB>({} as Prisma.TransactionClient);
});
