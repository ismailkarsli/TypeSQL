import type { Col, Typed } from "@typesql/core/sqlite";
import type {
	ColumnConfig,
	ColumnKey,
	ColumnLike,
	DbDefault,
	IsGenerated,
	Nullable,
	ViewKey,
} from "./column.js";

export interface DrizzleSqliteColumnTypes {
	SQLiteInteger: "integer";
	SQLiteTimestamp: "integer";
	SQLiteBoolean: "integer";
	SQLiteReal: "real";
	SQLiteNumeric: "numeric";
	SQLiteNumericNumber: "numeric";
	SQLiteNumericBigInt: "numeric";
	SQLiteBigInt: "blob";
	SQLiteBlobJson: "blob";
	SQLiteBlobBuffer: "blob";
	SQLiteCustomColumn: "any";
}

type SqliteTypeOf<D extends ColumnConfig> = D extends {
	readonly typesqlType: infer T extends string;
}
	? T
	: D["columnType"] extends keyof DrizzleSqliteColumnTypes
		? DrizzleSqliteColumnTypes[D["columnType"]]
		: D["columnType"] extends "SQLiteText"
			? D["enumValues"] extends readonly [string, ...string[]]
				? string extends D["enumValues"][number]
					? "text"
					: Typed<"text", D["enumValues"][number]>
				: "text"
			: D["columnType"] extends "SQLiteTextJson"
				? Typed<"json", D["data"]>
				: "any";

export type SqliteColumns<C, Opts> = {
	-readonly [K in keyof C as ColumnKey<C, K, Opts>]: C[K] extends ColumnLike
		? Col<
				SqliteTypeOf<C[K]["_"]>,
				{
					nullable: Nullable<C[K]["_"]>;
					hasDefault: DbDefault<C[K]["_"]>;
					generated: IsGenerated<C[K]["_"]>;
				}
			>
		: never;
};

export type SqliteViewColumns<F, Opts> = {
	-readonly [K in keyof F as ViewKey<F, K, Opts>]: F[K] extends ColumnLike
		? Col<SqliteTypeOf<F[K]["_"]>, { nullable: Nullable<F[K]["_"]> }>
		: Col<"any", { nullable: true }>;
};
