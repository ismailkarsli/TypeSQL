import type { ColDesc, Table, View } from "../schema/column.js";
import type { TsParamTypeOf } from "../type-map/index.js";
import type { JsonValue, ValueEnc } from "./inline.js";
import type { Next } from "./lexer/next.js";
import type { QuotedIdent, UnionList } from "./splice.js";

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

export type NoExtraKeys<P, Allowed> = P & {
	readonly [K in Exclude<keyof P, keyof Allowed>]: never;
};

type KeysOf<R> = R extends unknown ? keyof R & string : never;
type ValueAt<R, K extends string> = R extends unknown
	? K extends keyof R
		? R[K]
		: never
	: never;
type CarriedOfKeys<
	R,
	Ks extends readonly unknown[],
	Acc extends readonly unknown[] = [],
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? CarriedOfKeys<
			R,
			Rest,
			[...Acc, ValueEnc<Exclude<ValueAt<R, K>, undefined>>]
		>
	: Acc;

type JoinAssignments<
	Ks extends readonly unknown[],
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinAssignments<
			Rest,
			Next[N],
			Acc extends ""
				? `${QuotedIdent<[K]>} = $${N}`
				: `${Acc}, ${QuotedIdent<[K]>} = $${N}`
		>
	: Acc;
type JoinNames<
	Ks extends readonly unknown[],
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinNames<
			Rest,
			Acc extends "" ? QuotedIdent<[K]> : `${Acc}, ${QuotedIdent<[K]>}`
		>
	: Acc;
type JoinPlaceholders<
	Ks extends readonly unknown[],
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [string, ...infer Rest]
	? JoinPlaceholders<Rest, Next[N], Acc extends "" ? `$${N}` : `${Acc}, $${N}`>
	: Acc;

export type SetRep<P> =
	UnionList<KeysOf<P>> extends infer Ks extends readonly unknown[]
		? {
				readonly text: JoinAssignments<Ks>;
				readonly carried: CarriedOfKeys<P, Ks>;
			}
		: never;

export type ValuesRep<R> =
	UnionList<KeysOf<R>> extends infer Ks extends readonly unknown[]
		? Ks extends readonly []
			? { readonly text: "DEFAULT VALUES"; readonly carried: [] }
			: {
					readonly text: `(${JoinNames<Ks>}) VALUES (${JoinPlaceholders<Ks>})`;
					readonly carried: CarriedOfKeys<R, Ks>;
				}
		: never;
