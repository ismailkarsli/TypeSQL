import type { TransactionalSql } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import { driver, type PrismaRawClient } from "./client.js";
import type { FromPrisma, PrismaTypeMapLike } from "./from-prisma.js";
import type { PrismaTypeMap } from "./type-map.js";

export { executor, type PrismaRawClient } from "./client.js";
export type {
	FieldOverride,
	FromPrisma,
	ModelOverride,
	PrismaOverrides,
	PrismaScalarToPg,
	PrismaTypeMapLike,
} from "./from-prisma.js";
export type { PrismaTypeMap } from "./type-map.js";

export type PrismaSchema<S> = S extends PrismaTypeMapLike ? FromPrisma<S> : S;

export type PrismaSql<S, TM = PrismaTypeMap> = TransactionalSql<
	PrismaSchema<S>,
	TM
>;

export function createSql<S, TM = PrismaTypeMap>(
	prisma?: PrismaRawClient,
): PrismaSql<S, TM> {
	return createTransactionalSql<PrismaSchema<S>, TM, PrismaRawClient>(
		prisma,
		driver,
	) as PrismaSql<S, TM>;
}
