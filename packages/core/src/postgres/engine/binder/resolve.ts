import type { Next } from "../../../engine/next.js";
import type {
	ColInfo,
	ColMap,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "../../../engine/types.js";
import type { SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
import type { TableRef } from "../ast.js";
import type { MetaKey } from "../db.js";
import type { RowInfo } from "../shape.js";
import type { CteMap } from "../types.js";

export type ResolveTable<
	DB,
	Ref extends TableRef,
	Ctes extends CteMap,
> = Ref["schema"] extends null
	? Ref["name"] extends keyof Ctes
		? Ctes[Ref["name"]]
		: Ref["name"] extends keyof DB
			? LookupTable<DB, Ref["name"]>
			: InPgCatalog<DB, Ref["name"]> extends true
				? LookupTable<DB["pg_catalog" & keyof DB], Ref["name"]>
				: LookupTable<DB, Ref["name"]>
	: Ref["schema"] extends "public"
		? LookupTable<DB, Ref["name"], `public.${Ref["name"]}`>
		: Ref["schema"] extends Exclude<keyof DB, MetaKey>
			? LookupTable<
					DB[Ref["schema"]],
					Ref["name"],
					`${Ref["schema"]}.${Ref["name"]}`
				>
			: SqlError<
					`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`,
					null
				>;

type LookupTable<
	NS,
	Name extends string,
	Display extends string = Name,
> = Name extends keyof NS
	? NS[Name] extends View<infer Cols>
		? Cols
		: NS[Name] extends Table
			? NS[Name]
			: NotTable<Name, Display>
	: SqlError<`relation "${Display}" does not exist`, null>;
/** A key that is no relation; the schema's own declarations don't exist to SQL. */
type NotTable<Name, Display extends string> = Name extends MetaKey
	? SqlError<`relation "${Display}" does not exist`, null>
	: SqlError<`"${Display}" is not a table`, null>;

type InPgCatalog<DB, Name extends string> = DB extends {
	readonly pg_catalog: infer PC;
}
	? Name extends keyof PC
		? true
		: false
	: false;

export type ResolveWritableTable<
	DB,
	Ref extends TableRef,
> = Ref["schema"] extends null | "public"
	? Ref["name"] extends keyof DB
		? DB[Ref["name"]] extends View<Table>
			? SqlError<`cannot modify view "${Ref["name"]}"`, null>
			: DB[Ref["name"]] extends Table
				? DB[Ref["name"]]
				: NotTable<Ref["name"], Ref["name"]>
		: Ref["schema"] extends null
			? InPgCatalog<DB, Ref["name"]> extends true
				? SqlError<`cannot modify view "pg_catalog.${Ref["name"]}"`, null>
				: SqlError<`relation "${Ref["name"]}" does not exist`, null>
			: SqlError<`relation "public.${Ref["name"]}" does not exist`, null>
	: Ref["schema"] extends Exclude<keyof DB, MetaKey>
		? Ref["name"] extends keyof DB[Ref["schema"]]
			? DB[Ref["schema"]][Ref["name"]] extends View<Table>
				? SqlError<`cannot modify view "${Ref["schema"]}.${Ref["name"]}"`, null>
				: DB[Ref["schema"]][Ref["name"]] extends Table
					? DB[Ref["schema"]][Ref["name"]]
					: SqlError<`"${Ref["schema"]}.${Ref["name"]}" is not a table`, null>
			: SqlError<
					`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`,
					null
				>
		: SqlError<
				`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`,
				null
			>;

export type ResolveColumn<
	S extends Scope,
	Tbl extends string | null,
	Name extends string,
> = S extends readonly []
	? ResolveColumnGeneral<S, Tbl, Name>
	: S[0]["length"] extends 1
		? Tbl extends string
			? S[0][0]["alias"] extends Tbl
				? Name extends keyof S[0][0]["cols"]
					? S[0][0]["cols"][Name]
					: SqlError<`column ${Tbl}.${Name} does not exist`, null>
				: ResolveColumnGeneral<S, Tbl, Name>
			: Name extends keyof S[0][0]["cols"]
				? Name extends S[0][0]["skip"][number]
					? ResolveColumnGeneral<S, Tbl, Name>
					: S[0][0]["cols"][Name]
				: ResolveColumnGeneral<S, Tbl, Name>
		: ResolveColumnGeneral<S, Tbl, Name>;
type ResolveColumnGeneral<
	S extends Scope,
	Tbl extends string | null,
	Name extends string,
> = Tbl extends string
	? ResolveQualified<S, Tbl, Name>
	: ResolveBare<S, Name, S>;

type ResolveQualified<
	S extends Scope,
	Tbl extends string,
	Name extends string,
	Depth extends number = 0,
> = S extends unknown ? ResolveQualifiedAt<S, Tbl, Name, Depth> : never;
type ResolveQualifiedAt<
	S extends Scope,
	Tbl extends string,
	Name extends string,
	Depth extends number = 0,
	L extends ScopeLevel = S[Depth],
> = Depth extends S["length"]
	? SqlError<`missing FROM-clause entry for table "${Tbl}"`, null>
	: L extends unknown
		? FindAliasAt<L, Tbl> extends infer Item extends number
			? Name extends keyof L[Item]["cols"]
				? L[Item]["cols"][Name]
				: SqlError<`column ${Tbl}.${Name} does not exist`, null>
			: FindAliasAt<L, Tbl> extends null
				? ResolveQualifiedAt<S, Tbl, Name, Next<Depth>>
				: FindAliasAt<L, Tbl>
		: never;

type FindAliasAt<
	L extends ScopeLevel,
	Tbl extends string,
	I extends number = 0,
	Found extends number | null = null,
> = I extends L["length"]
	? Found
	: L[I]["alias"] extends Tbl
		? Found extends number
			? SqlError<`table reference "${Tbl}" is ambiguous`, null>
			: FindAliasAt<L, Tbl, Next<I>, I>
		: FindAliasAt<L, Tbl, Next<I>, Found>;

type ResolveBare<
	S extends Scope,
	Name extends string,
	All extends Scope,
	Depth extends number = 0,
> = S extends unknown ? ResolveBareAt<S, Name, All, Depth> : never;
type ResolveBareAt<
	S extends Scope,
	Name extends string,
	All extends Scope,
	Depth extends number = 0,
> = Depth extends S["length"]
	? WholeRow<All, Name, `column "${Name}" does not exist`>
	: FindBare<S[Depth], Name, null> extends ColInfo
		? FindBare<S[Depth], Name, null>
		: FindBare<S[Depth], Name, null> extends "ambiguous"
			? SqlError<`column reference "${Name}" is ambiguous`, null>
			: ResolveBareAt<S, Name, All, Next<Depth>>;
export type WholeRow<
	S extends Scope,
	Name extends string,
	Missing extends string,
	Depth extends number = 0,
> = S extends unknown ? WholeRowAt<S, Name, Missing, Depth> : never;
type WholeRowAt<
	S extends Scope,
	Name extends string,
	Missing extends string,
	Depth extends number = 0,
	L extends ScopeLevel = S[Depth],
> = Depth extends S["length"]
	? SqlError<Missing, null>
	: L extends unknown
		? FindAliasAt<L, Name> extends infer Item extends number
			? RowInfo<L[Item]["cols"]>
			: FindAliasAt<L, Name> extends null
				? WholeRowAt<S, Name, Missing, Next<Depth>>
				: FindAliasAt<L, Name>
		: never;

type FindBare<
	L extends ScopeLevel,
	Name extends string,
	Found extends ColInfo | null,
	I extends number = 0,
> = L extends unknown ? FindBareAt<L, Name, Found, I> : never;
type FindBareAt<
	L extends ScopeLevel,
	Name extends string,
	Found extends ColInfo | null,
	I extends number = 0,
> = I extends L["length"]
	? Found
	: Name extends L[I]["skip"][number]
		? FindBareAt<L, Name, Found, Next<I>>
		: Name extends keyof L[I]["cols"]
			? Found extends ColInfo
				? "ambiguous"
				: FindBareAt<L, Name, L[I]["cols"][Name], Next<I>>
			: FindBareAt<L, Name, Found, Next<I>>;

export type ExpandStar<
	S extends Scope,
	Tbl extends string | null,
> = S extends readonly [
	infer L extends ScopeLevel,
	...infer Outer extends Scope,
]
	? Tbl extends string
		? L extends unknown
			? FindAliasAt<L, Tbl> extends infer Item extends number
				? L[Item]["cols"]
				: FindAliasAt<L, Tbl> extends null
					? ExpandStar<Outer, Tbl>
					: FindAliasAt<L, Tbl>
			: never
		: L extends readonly []
			? SqlError<"SELECT * with no tables specified is not valid", null>
			: L extends readonly [
						{
							readonly cols: infer M;
							readonly skip: readonly [];
						},
					]
				? M
				: ExpandAll<L, []>
	: SqlError<`missing FROM-clause entry for table "${Tbl}"`, null>;

type ExpandAll<
	L extends ScopeLevel,
	Maps extends readonly ColMap[],
> = L extends readonly [
	infer I extends ScopeItem,
	...infer R extends ScopeLevel,
]
	? ExpandAll<
			R,
			[
				...Maps,
				I["skip"] extends readonly []
					? I["cols"]
					: Omit<I["cols"], I["skip"][number]>,
			]
		>
	: { readonly [K in AllKeys<Maps[number]>]: LastWith<Maps, K> };
type AllKeys<M> = M extends ColMap ? keyof M : never;
type LastWith<Maps extends readonly ColMap[], K> = Maps extends readonly [
	...infer R extends readonly ColMap[],
	infer M,
]
	? K extends keyof M
		? M[K]
		: LastWith<R, K>
	: never;
