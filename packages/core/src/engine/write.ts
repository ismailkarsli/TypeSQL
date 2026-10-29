import type { ColDesc, Table, View } from "../schema.js";
import type { JsonValue } from "../sql/inline.js";
import type { EngineTypes, TsParamTypeOf } from "./contract.js";

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

export type ColIn<
	E extends EngineTypes,
	TM,
	DB,
	D extends ColDesc,
> = D["type"] extends "null"
	? null
	:
			| (D["nullable"] extends true
					? TsParamTypeOf<E, TM, DB, D["type"]> | null
					: TsParamTypeOf<E, TM, DB, D["type"]>)
			| (D["type"] extends E["json"] ? JsonValue : never);

export type SetInput<E extends EngineTypes, DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? {
				readonly [K in Writable<Tbl>]?: ColIn<E, TM, DB, Tbl[K]> | undefined;
			}
		: never;

type Writable<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends
		| { readonly generated: true }
		| { readonly hidden: true }
		? never
		: K;
}[keyof Tbl];

type Required_<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends {
		readonly nullable: false;
		readonly hasDefault: false;
	}
		? K
		: never;
}[keyof Tbl];

export type InsertInput<E extends EngineTypes, DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? Flat<
				{ readonly [K in Required_<Tbl>]: ColIn<E, TM, DB, Tbl[K]> } & {
					readonly [K in Exclude<Writable<Tbl>, Required_<Tbl>>]?:
						| ColIn<E, TM, DB, Tbl[K]>
						| undefined;
				}
			>
		: never;
type Flat<O> = { [K in keyof O]: O[K] };
