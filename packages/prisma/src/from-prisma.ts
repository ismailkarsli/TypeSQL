import type { MysqlColumns } from "./from-prisma-mysql.js";
import type { Enums, PgColumns } from "./from-prisma-pg.js";
import type { SqliteColumns } from "./from-prisma-sqlite.js";
import type {
	Get,
	Models,
	PrismaOverrides,
	PrismaTypeMapLike,
	TableName,
} from "./model.js";

/**
 * The PostgreSQL schema of a Prisma client's `Prisma.TypeMap`: a model with
 * a `$schema` override is a table of that namespace, and enums are types.
 */
export type FromPrisma<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = TopLevel<TM, Overrides> &
	Namespaced<TM, Overrides> & { $types: Enums<TM, Overrides> } extends infer DB
	? { [K in keyof DB]: DB[K] }
	: never;

export type FromPrismaMysql<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = Tables<TM, Overrides, "mysql">;

export type FromPrismaSqlite<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = Tables<TM, Overrides, "sqlite">;

type Dialect = "postgres" | "mysql" | "sqlite";

// Each dialect's columns are a mapped type of their own: one whose column
// type depends on the dialect costs more to check.
type Columns<M, MO, D extends Dialect> = D extends "mysql"
	? MysqlColumns<M, MO>
	: D extends "sqlite"
		? SqliteColumns<M, MO>
		: PgColumns<M, MO>;

// A model Prisma can't create rows of is a view.
type TableOf<M, MO, D extends Dialect> = M extends {
	operations: { createMany: unknown };
}
	? Columns<M, MO, D>
	: { readonly $view: Columns<M, MO, D> };

/** Every model as a top-level table. */
type Tables<TM extends PrismaTypeMapLike, O, D extends Dialect> = {
	-readonly [N in keyof Models<TM> as TableName<N, Get<O, N>>]: TableOf<
		Models<TM>[N],
		Get<O, N>,
		D
	>;
};

type SchemaName<MO> = MO extends { readonly $schema: infer S extends string }
	? S extends "public"
		? never
		: S
	: never;

type TopLevel<TM extends PrismaTypeMapLike, O> = {
	-readonly [N in keyof Models<TM> as [SchemaName<Get<O, N>>] extends [never]
		? TableName<N, Get<O, N>>
		: never]: TableOf<Models<TM>[N], Get<O, N>, "postgres">;
};
type Namespaced<TM extends PrismaTypeMapLike, O> = {
	-readonly [S in {
		[N in keyof Models<TM>]: SchemaName<Get<O, N>>;
	}[keyof Models<TM>]]: {
		-readonly [N in keyof Models<TM> as SchemaName<Get<O, N>> extends S
			? TableName<N, Get<O, N>>
			: never]: TableOf<Models<TM>[N], Get<O, N>, "postgres">;
	};
};
