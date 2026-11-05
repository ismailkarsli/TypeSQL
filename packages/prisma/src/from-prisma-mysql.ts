import type { Typed } from "@typesql/core/mysql";
import type {
	Column,
	ColumnName,
	Fields,
	Get,
	Models,
	NullableKeys,
	OptionalCreateKeys,
	PrismaOverrides,
	PrismaTypeMapLike,
	Scalars,
	TableName,
	TypeName,
} from "./from-prisma.js";

/** Prisma's default MySQL column types; native types (`@db.Text`, …) need an override. */
export interface PrismaScalarToMysql {
	Int: "int";
	BigInt: "bigint";
	Float: "double";
	Decimal: "decimal";
	String: "varchar";
	Boolean: "tinyint";
	DateTime: "datetime";
	Json: "json";
	Bytes: "longblob";
}

type MysqlOf<T extends string, V> = T extends keyof PrismaScalarToMysql
	? PrismaScalarToMysql[T]
	: Typed<"enum", Exclude<V, null>>;

type ColumnType<T extends string, V, O> = O extends string
	? O
	: O extends { readonly type: infer X extends string }
		? X
		: MysqlOf<T, V>;

type ModelColumns<
	M,
	MO,
	FS = Fields<M>,
	S = Scalars<M>,
	Null = NullableKeys<M>,
	Opt = OptionalCreateKeys<M>,
> = {
	-readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Column<
		ColumnType<TypeName<FS[F]>, Get<S, F>, Get<MO, F>>,
		F extends Null ? true : false,
		F extends Opt ? true : false,
		Get<MO, F>
	>;
};

type TableOf<M, MO> = M extends { operations: { createMany: unknown } }
	? ModelColumns<M, MO>
	: { readonly $view: ModelColumns<M, MO> };

export type FromPrismaMysql<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = {
	-readonly [N in keyof Models<TM> as TableName<N, Get<Overrides, N>>]: TableOf<
		Models<TM>[N],
		Get<Overrides, N>
	>;
};
