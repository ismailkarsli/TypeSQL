import type { Typed } from "@typesql/core/sqlite";
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

export interface PrismaScalarToSqlite {
	Int: "integer";
	BigInt: "bigint";
	Float: "real";
	Decimal: "decimal";
	String: "text";
	Boolean: "boolean";
	DateTime: "datetime";
	Json: "jsonb";
	Bytes: "blob";
}

type SqliteOf<T extends string, V> = T extends keyof PrismaScalarToSqlite
	? PrismaScalarToSqlite[T]
	: Typed<"text", Exclude<V, null>>;

type ColumnType<T extends string, V, O> = O extends string
	? O
	: O extends { readonly type: infer X extends string }
		? X
		: SqliteOf<T, V>;

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

export type FromPrismaSqlite<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = {
	-readonly [N in keyof Models<TM> as TableName<N, Get<Overrides, N>>]: TableOf<
		Models<TM>[N],
		Get<Overrides, N>
	>;
};
