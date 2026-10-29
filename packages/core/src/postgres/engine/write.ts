import type { ColDesc, Table, View } from "../../schema.js";
import type { JsonValue } from "../../sql/inline.js";
import type { TsParamTypeOf } from "../type-map/index.js";

type IsTable<X> = X extends Table ? true : false;

export type TableName<DB> =
	| {
			[K in keyof DB & string]: IsTable<DB[K]> extends true ? K : never;
	  }[keyof DB & string]
	| {
			[NS in keyof DB & string]: IsTable<DB[NS]> extends true
				? never
				: DB[NS] extends View<Table>
					? never
					: NsTables<NS, DB[NS]>;
	  }[keyof DB & string];
type NsTables<NS extends string, N> = {
	[K in keyof N & string]: IsTable<N[K]> extends true ? `${NS}.${K}` : never;
}[keyof N & string];

export type RelationName<DB> = {
	[K in keyof DB & string]: DB[K] extends View<Table>
		? K
		: IsTable<DB[K]> extends true
			? K
			: never;
}[keyof DB & string];

export type TableOf<DB, T extends string> = T extends keyof DB
	? DB[T] extends Table
		? DB[T]
		: never
	: T extends `${infer NS}.${infer N}`
		? NS extends keyof DB
			? N extends keyof DB[NS]
				? DB[NS][N] extends Table
					? DB[NS][N]
					: never
				: never
			: never
		: never;

export type ColIn<TM, DB, D extends ColDesc> = D["type"] extends "null"
	? null
	:
			| (D["nullable"] extends true
					? TsParamTypeOf<TM, DB, D["type"]> | null
					: TsParamTypeOf<TM, DB, D["type"]>)
			| (D["type"] extends "json" | "jsonb" ? JsonValue : never);

export type SetInput<DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? { readonly [K in keyof Tbl]?: ColIn<TM, DB, Tbl[K]> | undefined }
		: never;

type Required_<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends {
		readonly nullable: false;
		readonly hasDefault: false;
	}
		? K
		: never;
}[keyof Tbl];

export type InsertInput<DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? Flat<
				{ readonly [K in Required_<Tbl>]: ColIn<TM, DB, Tbl[K]> } & {
					readonly [K in Exclude<keyof Tbl, Required_<Tbl>>]?:
						| ColIn<TM, DB, Tbl[K]>
						| undefined;
				}
			>
		: never;
type Flat<O> = { [K in keyof O]: O[K] };
