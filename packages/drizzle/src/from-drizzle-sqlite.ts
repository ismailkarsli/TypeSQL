import type { Col, Typed } from "@typesql/core/sqlite";
import type {
	Aliased,
	Cased,
	ColumnConfig,
	ColumnLike,
	Flat,
	FromDrizzleOptions,
	TableLike,
	ViewLike,
} from "./from-drizzle.js";

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

type IsGenerated<D> = D extends {
	readonly generated: { readonly type: string };
}
	? true
	: false;

type ColOf<D extends ColumnConfig> = Col<
	SqliteTypeOf<D>,
	{
		nullable: D["notNull"] extends true ? false : true;
		hasDefault: D["hasDefault"] extends true
			? D["hasRuntimeDefault"] extends true
				? false
				: true
			: false;
		generated: IsGenerated<D>;
	}
>;

type Columns<C, Opts> = {
	-readonly [K in keyof C as C[K] extends ColumnLike
		? Cased<C[K]["_"]["name"], Opts>
		: never]: C[K] extends ColumnLike ? ColOf<C[K]["_"]> : never;
};

type ViewColumns<F, Opts> = {
	-readonly [K in keyof F as F[K] extends ColumnLike
		? Cased<F[K]["_"]["name"], Opts>
		: F[K] extends Aliased
			? K
			: never]: F[K] extends ColumnLike
		? Col<
				SqliteTypeOf<F[K]["_"]>,
				{ nullable: F[K]["_"]["notNull"] extends true ? false : true }
			>
		: Col<"any", { nullable: true }>;
};

type Relation<X, Opts> = X extends TableLike
	? Columns<X["_"]["columns"], Opts>
	: X extends ViewLike
		? { readonly $view: ViewColumns<X["_"]["selectedFields"], Opts> }
		: never;

type NameOf<X> = X extends TableLike | ViewLike ? X["_"]["name"] : never;

export type FromDrizzleSqlite<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = Schema extends TableLike | ViewLike
	? Flat<{ -readonly [N in NameOf<Schema>]: Relation<Schema, Opts> }>
	: Flat<{
			-readonly [K in keyof Schema as NameOf<Schema[K]>]: Relation<
				Schema[K],
				Opts
			>;
		}>;
