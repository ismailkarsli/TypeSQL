import type { SqlError } from "../../../errors.js";
import type { TableRef } from "../ast.js";
import type { Sig } from "../typer/catalog.js";
import type { TypeOfCol, WithType } from "./column.js";
import type { DelKey, Rebuild, RenameKey, SetKey } from "./object.js";
import type {
	AsView,
	ColsOf,
	IsNamespace,
	IsViewVal,
	MetaKey,
} from "./relation.js";

type Types<DB> = DB extends { readonly $types: infer R } ? R : {};

type Fns<DB> = DB extends { readonly $functions: infer F } ? F : {};

export type ApplyCreateFunction<
	DB,
	Name extends string,
	Ret extends string,
	Srf,
> = SetKey<
	DB,
	"$functions",
	SetKey<
		Fns<DB>,
		Name,
		Srf extends true ? Sig<["..."], Ret, { srf: true }> : Sig<["..."], Ret>
	>
>;

export type ApplyCreateEnum<
	DB,
	Name extends string,
	Vs extends readonly string[],
> =
	Types<DB> extends infer R
		? Name extends keyof R
			? SqlError<`type "${Name}" already exists`, null>
			: SetKey<DB, "$types", SetKey<R, Name, Vs[number]>>
		: never;

export type ApplyAlterEnum<DB, Name extends string, Act> =
	Types<DB> extends infer R
		? Name extends keyof R
			? Act extends {
					readonly t: "add_value";
					readonly value: infer V extends string;
					readonly ifNotExists: infer Ine;
				}
				? V extends R[Name]
					? Ine extends true
						? DB
						: SqlError<`enum label "${V}" already exists`, null>
					: SetKey<DB, "$types", SetKey<R, Name, R[Name] | V>>
				: Act extends {
							readonly t: "rename_value";
							readonly from: infer F extends string;
							readonly to: infer To extends string;
						}
					? F extends R[Name]
						? To extends R[Name]
							? SqlError<`enum label "${To}" already exists`, null>
							: SetKey<DB, "$types", SetKey<R, Name, Exclude<R[Name], F> | To>>
						: SqlError<`"${F}" is not an existing enum label`, null>
					: Act extends {
								readonly t: "rename";
								readonly to: infer To extends string;
							}
						? To extends keyof R
							? SqlError<`type "${To}" already exists`, null>
							: RetypeDeep<DB, Name, To>
						: DB
			: SqlError<`type "${Name}" does not exist`, null>
		: never;

type RetypeDeep<DB, F extends string, To extends string> = Rebuild<{
	[K in keyof DB]: K extends "$types"
		? RenameKey<DB[K], F, To>
		: K extends "$functions"
			? DB[K]
			: DB[K] extends { readonly $view: infer C }
				? AsView<RetypeCols<C, F, To>>
				: IsNamespace<DB[K]> extends true
					? RetypeNs<DB[K], F, To>
					: RetypeCols<DB[K], F, To>;
}>;

type RetypeNs<NS, F extends string, To extends string> = Rebuild<{
	[K in keyof NS]: NS[K] extends { readonly $view: infer C }
		? AsView<RetypeCols<C, F, To>>
		: RetypeCols<NS[K], F, To>;
}>;

type RetypeCols<Tbl, F extends string, To extends string> = Rebuild<{
	[K in keyof Tbl]: TypeOfCol<Tbl[K]> extends F
		? WithType<Tbl[K], To>
		: TypeOfCol<Tbl[K]> extends `${F}[]`
			? WithType<Tbl[K], `${To}[]`>
			: Tbl[K];
}>;

export type ApplyDropTypes<DB, Refs, Ife, Casc> = Refs extends readonly [
	infer N extends TableRef,
	...infer Rest,
]
	? Types<DB> extends infer R
		? N["name"] extends keyof R
			? UsesType<DB, N["name"]> extends true
				? Casc extends true
					? ApplyDropTypes<DropTypeCols<DB, N["name"]>, Rest, Ife, Casc>
					: SqlError<
							`cannot drop type ${N["name"]} because other objects depend on it`,
							null
						>
				: ApplyDropTypes<
						SetKey<DB, "$types", DelKey<R, N["name"]>>,
						Rest,
						Ife,
						Casc
					>
			: Ife extends true
				? ApplyDropTypes<DB, Rest, Ife, Casc>
				: SqlError<`type "${N["name"]}" does not exist`, null>
		: never
	: DB;

type ColUses<C, N extends string> =
	TypeOfCol<C> extends N | `${N}[]` ? true : false;

type TblUses<Tbl, N extends string> = true extends {
	[C in keyof Tbl]: ColUses<Tbl[C], N>;
}[keyof Tbl]
	? true
	: false;

type UsesType<DB, N extends string> = true extends {
	[K in keyof DB]: K extends MetaKey
		? false
		: IsNamespace<DB[K]> extends true
			? NsUses<DB[K], N>
			: TblUses<ColsOf<DB[K]>, N>;
}[keyof DB]
	? true
	: false;

type NsUses<NS, N extends string> = true extends {
	[K in keyof NS]: TblUses<ColsOf<NS[K]>, N>;
}[keyof NS]
	? true
	: false;

type DropTypeCols<DB, N extends string> = Rebuild<{
	[K in keyof DB as K extends MetaKey
		? K
		: IsViewVal<DB[K]> extends true
			? TblUses<ColsOf<DB[K]>, N> extends true
				? never
				: K
			: K]: K extends "$types"
		? DelKey<DB[K], N>
		: K extends "$functions"
			? DB[K]
			: IsViewVal<DB[K]> extends true
				? DB[K]
				: IsNamespace<DB[K]> extends true
					? DropTypeNs<DB[K], N>
					: StripCols<DB[K], N>;
}>;

type DropTypeNs<NS, N extends string> = Rebuild<{
	[K in keyof NS as IsViewVal<NS[K]> extends true
		? TblUses<ColsOf<NS[K]>, N> extends true
			? never
			: K
		: K]: IsViewVal<NS[K]> extends true ? NS[K] : StripCols<NS[K], N>;
}>;

type StripCols<Tbl, N extends string> = Rebuild<{
	[K in keyof Tbl as ColUses<Tbl[K], N> extends true ? never : K]: Tbl[K];
}>;
