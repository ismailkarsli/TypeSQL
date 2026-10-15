import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Executor, Query, RowType } from "@typesql/core";

/** Anything with Prisma Client's raw methods: a `PrismaClient`, an extended client or a transaction client. */
export interface PrismaRawClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): PrismaPromise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): PrismaPromise<number>;
}

type AnyQuery = Query<unknown, readonly unknown[]>;

/** An `Executor` for core's `q.execute()`: runs queries through `prisma.$queryRawUnsafe(text, ...values)`. */
export function executor(prisma: PrismaRawClient): Executor {
  return (text, values) => prisma.$queryRawUnsafe<unknown[]>(text, ...values);
}

/**
 * Run a typesql query through `prisma.$queryRawUnsafe(text, ...values)` and type the rows from
 * the query. Values are always sent as bind parameters (`$n`), never interpolated. The result is
 * a `PrismaPromise`, so it can go into `prisma.$transaction([...])`.
 */
export function queryRaw<Q extends AnyQuery>(prisma: PrismaRawClient, q: Q): PrismaPromise<RowType<Q>[]> {
  return prisma.$queryRawUnsafe<RowType<Q>[]>(q.text, ...q.values);
}

/** Run a statement through `prisma.$executeRawUnsafe(text, ...values)`; resolves to the affected row count. */
export function executeRaw(prisma: PrismaRawClient, q: AnyQuery): PrismaPromise<number> {
  return prisma.$executeRawUnsafe(q.text, ...q.values);
}
