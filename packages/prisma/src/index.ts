import { createSql as createCoreSql, type Sql } from "typesql";
import type { FromPrisma, PrismaTypeMapLike } from "./from-prisma.js";
import type { PrismaTypeMap } from "./type-map.js";

export type { FromPrisma, PrismaOverrides, ModelOverride, FieldOverride, PrismaScalarToPg, PrismaTypeMapLike } from "./from-prisma.js";
export type { PrismaTypeMap } from "./type-map.js";
export { queryRaw, executeRaw, type PrismaRawClient } from "./client.js";

/** A typesql schema as is, or a generated `Prisma.TypeMap` converted with `FromPrisma`. */
export type PrismaSchema<S> = S extends PrismaTypeMapLike ? FromPrisma<S> : S;

/**
 * `createSql` from core with `PrismaTypeMap` (what `$queryRaw` returns: `int8` is `bigint`,
 * `numeric` is `Decimal`). `S` is a generated `Prisma.TypeMap`, a `FromPrisma<...>` with
 * overrides, or the `DB` interface written by the `typesql-prisma` generator.
 */
export function createSql<S, TM = PrismaTypeMap>(): Sql<PrismaSchema<S>, TM> {
  return createCoreSql<PrismaSchema<S>, TM>();
}
