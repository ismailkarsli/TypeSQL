import { createFamilySql } from "@typesql/core/adapter";
import type {
	MariaDbDialect,
	MariaDbTransactionalSql,
	MySqlDialect,
	TransactionalSql as MysqlTransactionalSql,
} from "@typesql/core/mysql";
import type { PostgresDialect, TransactionalSql } from "@typesql/core/postgres";
import type {
	SqliteDialect,
	TransactionalSql as SqliteTransactionalSql,
} from "@typesql/core/sqlite";
import { driverOf, type PrismaRawClient } from "./client.js";
import type {
	FromPrisma,
	FromPrismaMysql,
	FromPrismaSqlite,
} from "./from-prisma.js";
import type { PrismaTypeMapLike } from "./model.js";
import type {
	PrismaMariaDbTypeMap,
	PrismaMysqlTypeMap,
} from "./mysql-type-map.js";
import type { PrismaSqliteTypeMap } from "./sqlite-type-map.js";
import type { PrismaTypeMap } from "./type-map.js";

export { executor, type PrismaRawClient } from "./client.js";
export type {
	FromPrisma,
	FromPrismaMysql,
	FromPrismaSqlite,
} from "./from-prisma.js";
export type { PrismaScalarToMysql } from "./from-prisma-mysql.js";
export type { PrismaScalarToPg } from "./from-prisma-pg.js";
export type { PrismaScalarToSqlite } from "./from-prisma-sqlite.js";
export type {
	FieldOverride,
	ModelOverride,
	PrismaOverrides,
	PrismaTypeMapLike,
} from "./model.js";
export type {
	PrismaMariaDbTypeMap,
	PrismaMysqlTypeMap,
} from "./mysql-type-map.js";
export type { PrismaSqliteTypeMap } from "./sqlite-type-map.js";
export type { PrismaTypeMap } from "./type-map.js";

export type PrismaSchema<S> = S extends PrismaTypeMapLike ? FromPrisma<S> : S;

export type PrismaSql<S, TM = PrismaTypeMap> = TransactionalSql<
	PrismaSchema<S>,
	TM
>;

export type PrismaSqliteSchema<S> = S extends PrismaTypeMapLike
	? FromPrismaSqlite<S>
	: S;

export type PrismaSqliteSql<
	S,
	TM = PrismaSqliteTypeMap,
> = SqliteTransactionalSql<PrismaSqliteSchema<S>, TM>;

export type PrismaMysqlSchema<S> = S extends PrismaTypeMapLike
	? FromPrismaMysql<S>
	: S;

export type PrismaMysqlSql<S, TM = PrismaMysqlTypeMap> = MysqlTransactionalSql<
	PrismaMysqlSchema<S>,
	TM
>;

export type PrismaMariaDbSql<
	S,
	TM = PrismaMariaDbTypeMap,
> = MariaDbTransactionalSql<PrismaMysqlSchema<S>, TM>;

type DelegateTypes<D> = D extends {
	readonly [k: symbol]: { readonly types: infer T };
}
	? T
	: never;
type ModelName<T> = T extends {
	readonly payload: { readonly name: infer N extends string };
}
	? N
	: never;

export type PrismaClientTypeMap<C> = {
	readonly model: {
		readonly [K in keyof C as K extends string
			? ModelName<DelegateTypes<C[K]>>
			: never]: DelegateTypes<C[K]>;
	};
};

export function createSql<C extends PrismaRawClient>(
	dialect: MySqlDialect,
	prisma: C,
): PrismaMysqlSql<PrismaClientTypeMap<C>>;
export function createSql<S, TM = PrismaMysqlTypeMap>(
	dialect: MySqlDialect,
	prisma?: PrismaRawClient,
): PrismaMysqlSql<S, TM>;
export function createSql<C extends PrismaRawClient>(
	dialect: MariaDbDialect,
	prisma: C,
): PrismaMariaDbSql<PrismaClientTypeMap<C>>;
export function createSql<S, TM = PrismaMariaDbTypeMap>(
	dialect: MariaDbDialect,
	prisma?: PrismaRawClient,
): PrismaMariaDbSql<S, TM>;
export function createSql<C extends PrismaRawClient>(
	dialect: SqliteDialect,
	prisma: C,
): PrismaSqliteSql<PrismaClientTypeMap<C>>;
export function createSql<S, TM = PrismaSqliteTypeMap>(
	dialect: SqliteDialect,
	prisma?: PrismaRawClient,
): PrismaSqliteSql<S, TM>;
export function createSql<C extends PrismaRawClient>(
	dialect: PostgresDialect,
	prisma: C,
): PrismaSql<PrismaClientTypeMap<C>>;
export function createSql<S, TM = PrismaTypeMap>(
	dialect: PostgresDialect,
	prisma?: PrismaRawClient,
): PrismaSql<S, TM>;
export function createSql(
	dialect: PostgresDialect | SqliteDialect | MySqlDialect | MariaDbDialect,
	prisma?: PrismaRawClient,
): object {
	return createFamilySql(dialect, prisma, driverOf);
}
