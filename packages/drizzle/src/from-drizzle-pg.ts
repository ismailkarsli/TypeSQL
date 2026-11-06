import type { Col } from "@typesql/core/postgres";
import type {
	ColumnConfig,
	ColumnKey,
	ColumnLike,
	DbDefault,
	FromDrizzleOptions,
	Nullable,
	ViewKey,
} from "./column.js";

export interface DrizzleColumnTypes {
	PgSmallInt: "int2";
	PgInteger: "int4";
	PgBigInt53: "int8";
	PgBigInt64: "int8";
	PgSmallSerial: "int2";
	PgSerial: "int4";
	PgBigSerial53: "int8";
	PgBigSerial64: "int8";
	PgNumeric: "numeric";
	PgNumericNumber: "numeric";
	PgNumericBigInt: "numeric";
	PgReal: "float4";
	PgDoublePrecision: "float8";
	PgBoolean: "bool";
	PgText: "text";
	PgVarchar: "varchar";
	PgChar: "bpchar";
	PgUUID: "uuid";
	PgDate: "date";
	PgDateString: "date";
	PgInterval: "interval";
	PgJson: "json";
	PgJsonb: "jsonb";
	PgInet: "inet";
	PgCidr: "cidr";
	PgMacaddr: "macaddr";
	PgMacaddr8: "macaddr8";
	PgPointTuple: "point";
	PgPointObject: "point";
	PgLine: "line";
	PgLineABC: "line";
	PgGeometry: "geometry";
	PgGeometryObject: "geometry";
	PgVector: "vector";
	PgHalfVector: "halfvec";
	PgSparseVector: "sparsevec";
	PgBinaryVector: "bit";
	PgCustomColumn: "unknown";
}

type EnumLike = {
	readonly enumName: string;
	readonly enumValues: readonly string[];
};

type EnumValues<X> = X extends {
	readonly enumValues: readonly [string, ...string[]];
}
	? X["enumValues"][number]
	: X extends () => { readonly _: { readonly data: infer D extends string } }
		? D
		: never;

/** The `pgEnum`s of a schema module, by export name. */
export type Enums<S> = {
	-readonly [K in keyof S as S[K] extends EnumLike ? K : never]: EnumValues<
		S[K]
	>;
};

type LastOf<U> = (U extends unknown ? (x: () => U) => void : never) extends (
	x: infer F,
) => void
	? F extends () => infer L
		? L
		: never
	: never;

type EnumName<V, E> = {
	[K in keyof E]: [E[K]] extends [V] ? ([V] extends [E[K]] ? K : never) : never;
}[keyof E] extends infer N
	? [N] extends [never]
		? "text"
		: LastOf<N> & string
	: never;

type Opt<Opts, K extends keyof FromDrizzleOptions, D> = Opts extends {
	readonly [P in K]: infer V extends string;
}
	? V
	: D;

/** A Drizzle `pg-core` column's PostgreSQL type, with the schema's enums `E`. */
type PgTypeOf<D extends ColumnConfig, Opts, E> = D extends {
	readonly typesqlType: infer T extends string;
}
	? T
	: D["columnType"] extends keyof DrizzleColumnTypes
		? DrizzleColumnTypes[D["columnType"]]
		: D["columnType"] extends "PgArray"
			? D["baseColumn"] extends ColumnLike
				? `${PgTypeOf<D["baseColumn"]["_"], Opts, E>}[]`
				: "unknown[]"
			: D["columnType"] extends "PgTimestamp" | "PgTimestampString"
				? Opt<Opts, "timestamp", "timestamp">
				: D["columnType"] extends "PgTime"
					? Opt<Opts, "time", "time">
					: D["columnType"] extends "PgEnumColumn"
						? EnumName<(D["enumValues"] & readonly string[])[number], E>
						: D["columnType"] extends "PgEnumObjectColumn"
							? EnumName<D["data"], E>
							: "unknown";

// One of four flag objects, so that columns of a type share one `Col`.
type PgCol<T extends string, N, H> = N extends true
	? H extends true
		? Col<T, { nullable: true; hasDefault: true }>
		: Col<T, { nullable: true }>
	: H extends true
		? Col<T, { hasDefault: true }>
		: Col<T>;

export type PgColumns<C, Opts, E> = {
	-readonly [K in keyof C as ColumnKey<C, K, Opts>]: C[K] extends ColumnLike
		? PgCol<
				PgTypeOf<C[K]["_"], Opts, E>,
				Nullable<C[K]["_"]>,
				DbDefault<C[K]["_"]>
			>
		: never;
};

export type PgViewColumns<F, Opts, E> = {
	-readonly [K in keyof F as ViewKey<F, K, Opts>]: F[K] extends ColumnLike
		? PgCol<PgTypeOf<F[K]["_"], Opts, E>, Nullable<F[K]["_"]>, false>
		: Col<"unknown", { nullable: true }>;
};
