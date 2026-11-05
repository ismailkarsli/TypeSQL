import type { Col, Typed } from "@typesql/core/mysql";
import type {
	ColumnConfig,
	ColumnKey,
	ColumnLike,
	DbDefault,
	Flat,
	FromDrizzleOptions,
	TableLike,
	ViewKey,
	ViewLike,
} from "./from-drizzle.js";

// Drizzle's types don't record `unsigned` or the text size (`tinytext`,
// `mediumtext`, `longtext`); pin those columns with `mysqlType`.
export interface DrizzleMysqlColumnTypes {
	MySqlTinyInt: "tinyint";
	MySqlSmallInt: "smallint";
	MySqlMediumInt: "mediumint";
	MySqlInt: "int";
	MySqlBigInt53: "bigint";
	MySqlBigInt64: "bigint";
	MySqlSerial: "bigint unsigned";
	MySqlBoolean: "tinyint";
	MySqlDecimal: "decimal";
	MySqlDecimalNumber: "decimal";
	MySqlDecimalBigInt: "decimal";
	MySqlFloat: "float";
	MySqlDouble: "double";
	MySqlReal: "double";
	MySqlBinary: "binary";
	MySqlVarBinary: "varbinary";
	MySqlDate: "date";
	MySqlDateString: "date";
	MySqlDateTime: "datetime";
	MySqlDateTimeString: "datetime";
	MySqlTimestamp: "timestamp";
	MySqlTimestampString: "timestamp";
	MySqlTime: "time";
	MySqlYear: "year";
	MySqlCustomColumn: "unknown";
}

interface StringColumnTypes {
	MySqlChar: "char";
	MySqlVarChar: "varchar";
	MySqlText: "text";
}

// A string column with `enum: [...]` keeps its values; MySQL has no check for
// them, so the type is the column's, not `enum`.
type StringOf<
	T extends string,
	E extends readonly string[] | undefined,
> = E extends readonly [string, ...string[]]
	? string extends E[number]
		? T
		: Typed<T, E[number]>
	: T;

type MysqlTypeOf<D extends ColumnConfig> = D extends {
	readonly typesqlType: infer T extends string;
}
	? T
	: D["columnType"] extends keyof DrizzleMysqlColumnTypes
		? DrizzleMysqlColumnTypes[D["columnType"]]
		: D["columnType"] extends keyof StringColumnTypes
			? StringOf<StringColumnTypes[D["columnType"]], D["enumValues"]>
			: D["columnType"] extends "MySqlEnumColumn"
				? Typed<"enum", (D["enumValues"] & readonly string[])[number]>
				: D["columnType"] extends "MySqlEnumObjectColumn"
					? Typed<"enum", D["data"]>
					: D["columnType"] extends "MySqlJson"
						? Typed<"json", D["data"]>
						: "unknown";

type IsGenerated<D> = D extends {
	readonly generated: { readonly type: string };
}
	? true
	: false;

type IsAutoIncrement<D> = D extends { readonly isAutoincrement: true }
	? true
	: false;

type ColOf<D extends ColumnConfig> = Col<
	MysqlTypeOf<D>,
	{
		nullable: D["notNull"] extends true ? false : true;
		hasDefault: DbDefault<D>;
		autoIncrement: IsAutoIncrement<D>;
		generated: IsGenerated<D>;
	}
>;

type Columns<C, Opts> = {
	-readonly [K in keyof C as ColumnKey<C, K, Opts>]: C[K] extends ColumnLike
		? ColOf<C[K]["_"]>
		: never;
};

type ViewColumns<F, Opts> = {
	-readonly [K in keyof F as ViewKey<F, K, Opts>]: F[K] extends ColumnLike
		? Col<
				MysqlTypeOf<F[K]["_"]>,
				{ nullable: F[K]["_"]["notNull"] extends true ? false : true }
			>
		: Col<"unknown", { nullable: true }>;
};

type Relation<X, Opts> = X extends TableLike
	? Columns<X["_"]["columns"], Opts>
	: X extends ViewLike
		? { readonly $view: ViewColumns<X["_"]["selectedFields"], Opts> }
		: never;

// Tables of a `mysqlSchema()` live in another database: `db.table`.
type SchemaOf<X> = X extends TableLike
	? Exclude<X["_"]["schema"], undefined>
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

type Build<S, Opts> = {
	-readonly [K in keyof S as TopName<S[K]>]: Relation<S[K], Opts>;
} & {
	[N in { [K in keyof S]: SchemaOf<S[K]> }[keyof S]]: {
		-readonly [K in keyof S as NameIn<S[K], N>]: Relation<S[K], Opts>;
	};
};

export type FromDrizzleMysql<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = Schema extends TableLike | ViewLike
	? Flat<Build<{ [K in Schema["_"]["name"]]: Schema }, Opts>>
	: Flat<Build<Schema, Opts>>;
