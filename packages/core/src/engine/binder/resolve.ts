import type { Table, View } from "../../schema/column.js";
import type { TableRef } from "../ast.js";
import type { SqlError } from "../errors.js";
import type { RowInfo } from "../shape.js";
import type {
	ColInfo,
	ColMap,
	CteMap,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "../types.js";

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
		: Ref["schema"] extends keyof DB
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
		? TableCols<Cols>
		: NS[Name] extends Table
			? TableCols<NS[Name]>
			: SqlError<`"${Display}" is not a table`, null>
	: SqlError<`relation "${Display}" does not exist`, null>;

type InPgCatalog<DB, Name extends string> = DB extends {
	readonly pg_catalog: infer PC;
}
	? Name extends keyof PC
		? true
		: false
	: false;

export type TableCols<T extends Table> = {
	readonly [K in keyof T]: {
		readonly type: T[K]["type"];
		readonly nullable: T[K]["nullable"];
	};
};

export type ResolveWritableTable<
	DB,
	Ref extends TableRef,
> = Ref["schema"] extends null | "public"
	? Ref["name"] extends keyof DB
		? DB[Ref["name"]] extends View<Table>
			? SqlError<`cannot modify view "${Ref["name"]}"`, null>
			: DB[Ref["name"]] extends Table
				? DB[Ref["name"]]
				: SqlError<`"${Ref["name"]}" is not a table`, null>
		: Ref["schema"] extends null
			? InPgCatalog<DB, Ref["name"]> extends true
				? SqlError<`cannot modify view "pg_catalog.${Ref["name"]}"`, null>
				: SqlError<`relation "${Ref["name"]}" does not exist`, null>
			: SqlError<`relation "public.${Ref["name"]}" does not exist`, null>
	: Ref["schema"] extends keyof DB
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
> = S extends readonly [readonly [infer I extends ScopeItem], ...Scope]
	? Tbl extends string
		? I["alias"] extends Tbl
			? Name extends keyof I["cols"]
				? I["cols"][Name]
				: SqlError<`column ${Tbl}.${Name} does not exist`, null>
			: ResolveColumnGeneral<S, Tbl, Name>
		: Name extends keyof I["cols"]
			? Name extends I["skip"][number]
				? ResolveColumnGeneral<S, Tbl, Name>
				: I["cols"][Name]
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
> = S extends readonly [
	infer L extends ScopeLevel,
	...infer Outer extends Scope,
]
	? FindAlias<L, Tbl> extends infer Item
		? Item extends ScopeItem
			? Name extends keyof Item["cols"]
				? Item["cols"][Name]
				: SqlError<`column ${Tbl}.${Name} does not exist`, null>
			: Item extends null
				? ResolveQualified<Outer, Tbl, Name>
				: Item
		: never
	: SqlError<`missing FROM-clause entry for table "${Tbl}"`, null>;

type FindAlias<L extends ScopeLevel, Tbl extends string> = L extends readonly [
	infer I extends ScopeItem,
	...infer R extends ScopeLevel,
]
	? I["alias"] extends Tbl
		? FindAlias<R, Tbl> extends null
			? I
			: SqlError<`table reference "${Tbl}" is ambiguous`, null>
		: FindAlias<R, Tbl>
	: null;

type ResolveBare<
	S extends Scope,
	Name extends string,
	All extends Scope,
> = S extends readonly [
	infer L extends ScopeLevel,
	...infer Outer extends Scope,
]
	? FindBare<L, Name, null> extends infer R
		? R extends ColInfo
			? R
			: R extends "ambiguous"
				? SqlError<`column reference "${Name}" is ambiguous`, null>
				: ResolveBare<Outer, Name, All>
		: never
	: WholeRow<All, Name, `column "${Name}" does not exist`>;

export type WholeRow<
	S extends Scope,
	Name extends string,
	Missing extends string,
> = S extends readonly [
	infer L extends ScopeLevel,
	...infer Outer extends Scope,
]
	? FindAlias<L, Name> extends infer Item
		? Item extends ScopeItem
			? RowInfo<Item["cols"]>
			: Item extends null
				? WholeRow<Outer, Name, Missing>
				: Item
		: never
	: SqlError<Missing, null>;

type FindBare<
	L extends ScopeLevel,
	Name extends string,
	Found extends ColInfo | null,
> = L extends readonly [
	infer I extends ScopeItem,
	...infer R extends ScopeLevel,
]
	? Name extends I["skip"][number]
		? FindBare<R, Name, Found>
		: Name extends keyof I["cols"]
			? Found extends ColInfo
				? "ambiguous"
				: FindBare<R, Name, I["cols"][Name]>
			: FindBare<R, Name, Found>
	: Found;

export type ExpandStar<
	S extends Scope,
	Tbl extends string | null,
> = S extends readonly [
	infer L extends ScopeLevel,
	...infer Outer extends Scope,
]
	? Tbl extends string
		? FindAlias<L, Tbl> extends infer Item
			? Item extends ScopeItem
				? Item["cols"]
				: Item extends null
					? ExpandStar<Outer, Tbl>
					: Item
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
