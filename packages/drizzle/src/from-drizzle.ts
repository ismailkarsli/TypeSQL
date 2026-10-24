import type {
	Col,
	Generated,
	Nullable,
	NullableGenerated,
} from "@typesql/core";
import type { ToCamelCase, ToSnakeCase } from "./casing.js";

/** Settings of your Drizzle setup that the column types do not record. */
export interface FromDrizzleOptions {
	/** The `casing` passed to `drizzle()`: applied to column names, as Drizzle does at runtime. */
	readonly casing?: "snake_case" | "camelCase" | undefined;
	/** Type of `timestamp()` columns not marked with `pgType` (Drizzle's types drop `withTimezone`). Default `"timestamp"`. */
	readonly timestamp?: "timestamp" | "timestamptz" | undefined;
	/** Type of `time()` columns not marked with `pgType`. Default `"time"`. */
	readonly time?: "time" | "timetz" | undefined;
}

/** Postgres type of each pg-core `columnType` with a fixed SQL type. */
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

type TableLike = {
	readonly _: {
		readonly brand: "Table";
		readonly name: string;
		readonly schema: string | undefined;
		readonly columns: object;
	};
};
type ViewLike = {
	readonly _: {
		readonly brand: "View";
		readonly name: string;
		readonly selectedFields: object;
	};
};
type EnumLike = {
	readonly enumName: string;
	readonly enumValues: readonly string[];
};
type ColumnLike = { readonly _: ColumnConfig };
type ColumnConfig = {
	readonly brand: "Column";
	readonly name: string;
	readonly columnType: string;
	readonly notNull: boolean;
	readonly hasDefault: boolean;
	readonly hasRuntimeDefault: boolean;
	readonly enumValues: readonly string[] | undefined;
	readonly data: unknown;
	readonly baseColumn: unknown;
};

/** Values of an exported `pgEnum` (array or object form). */
type EnumValues<X> = X extends {
	readonly enumValues: readonly [string, ...string[]];
}
	? X["enumValues"][number]
	: X extends () => { readonly _: { readonly data: infer D extends string } }
		? D
		: never;

/** `$types` registry: exported enums by export name. */
type Enums<S> = {
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

/** Name of the exported enum whose values are exactly `V` (any one when several match), else `text`. */
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

/** Postgres type of a column config. */
type PgTypeOf<D extends ColumnConfig, Opts = {}, E = {}> = D extends {
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

/** The descriptor as the matching core helper (`Col`, `Nullable`, `Generated`, `NullableGenerated`). */
type Desc<T extends string, N, H> = N extends true
	? H extends true
		? NullableGenerated<T>
		: Nullable<T>
	: H extends true
		? Generated<T>
		: Col<T>;

type ColOf<D extends ColumnConfig, Opts, E> = Desc<
	PgTypeOf<D, Opts, E>,
	D["notNull"] extends true ? false : true,
	D["hasDefault"] extends true
		? D["hasRuntimeDefault"] extends true
			? false
			: true
		: false
>;

type Cased<N extends string, Opts> = Opts extends {
	readonly casing: "snake_case";
}
	? ToSnakeCase<N>
	: Opts extends { readonly casing: "camelCase" }
		? ToCamelCase<N>
		: N;

type Columns<C, Opts, E> = {
	-readonly [K in keyof C as C[K] extends ColumnLike
		? Cased<C[K]["_"]["name"], Opts>
		: never]: C[K] extends ColumnLike ? ColOf<C[K]["_"], Opts, E> : never;
};

type Aliased = { readonly _: { readonly brand: "SQL.Aliased" } };
type ViewColumns<F, Opts, E> = {
	-readonly [K in keyof F as F[K] extends ColumnLike
		? Cased<F[K]["_"]["name"], Opts>
		: F[K] extends Aliased
			? K
			: never]: F[K] extends ColumnLike
		? Desc<
				PgTypeOf<F[K]["_"], Opts, E>,
				F[K]["_"]["notNull"] extends true ? false : true,
				false
			>
		: Nullable<"unknown">;
};

type Relation<X, Opts, E> = X extends TableLike
	? Columns<X["_"]["columns"], Opts, E>
	: X extends ViewLike
		? { readonly $view: ViewColumns<X["_"]["selectedFields"], Opts, E> }
		: never;

/** Postgres schema of a table outside `public`. */
type SchemaOf<X> = X extends TableLike
	? Exclude<X["_"]["schema"], undefined | "public">
	: never;
type NameIn<X, N> = X extends TableLike
	? X["_"]["schema"] extends N
		? X["_"]["name"]
		: never
	: never;
type TopName<X> = X extends TableLike
	? [SchemaOf<X>] extends [never]
		? X["_"]["name"]
		: never
	: X extends ViewLike
		? X["_"]["name"]
		: never;

type Build<S, Opts, E = Enums<S>> = {
	-readonly [K in keyof S as TopName<S[K]>]: Relation<S[K], Opts, E>;
} & {
	[N in { [K in keyof S]: SchemaOf<S[K]> }[keyof S]]: {
		-readonly [K in keyof S as NameIn<S[K], N>]: Relation<S[K], Opts, E>;
	};
} & (keyof E extends never ? {} : { $types: E });

type Flat<T> = { [K in keyof T]: T[K] } & {};

/**
 * A TypeSQL schema from Drizzle `pg-core` definitions: `FromDrizzle<typeof schema>` with
 * `import * as schema from "./schema"`. Also accepts a record of tables or a single table.
 *
 * Keys are SQL names (tables, columns, `pgSchema` namespaces); views become `View<…>`;
 * exported `pgEnum`s are registered under `$types` by export name. Anything else exported
 * (relations, sequences, helpers) is ignored.
 */
export type FromDrizzle<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = Schema extends TableLike | ViewLike
	? Flat<Build<{ [K in Schema["_"]["name"]]: Schema }, Opts>>
	: Flat<Build<Schema, Opts>>;
