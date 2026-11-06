import type { Col, Typed } from "@typesql/core/mysql";
import type {
	ColumnConfig,
	ColumnKey,
	ColumnLike,
	DbDefault,
	IsAutoIncrement,
	IsGenerated,
	Nullable,
	ViewKey,
} from "./column.js";

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

export type MysqlColumns<C, Opts> = {
	-readonly [K in keyof C as ColumnKey<C, K, Opts>]: C[K] extends ColumnLike
		? Col<
				MysqlTypeOf<C[K]["_"]>,
				{
					nullable: Nullable<C[K]["_"]>;
					hasDefault: DbDefault<C[K]["_"]>;
					autoIncrement: IsAutoIncrement<C[K]["_"]>;
					generated: IsGenerated<C[K]["_"]>;
				}
			>
		: never;
};

export type MysqlViewColumns<F, Opts> = {
	-readonly [K in keyof F as ViewKey<F, K, Opts>]: F[K] extends ColumnLike
		? Col<MysqlTypeOf<F[K]["_"]>, { nullable: Nullable<F[K]["_"]> }>
		: Col<"unknown", { nullable: true }>;
};
