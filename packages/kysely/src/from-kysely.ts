import type { View } from "@typesql/core/postgres";
import type { ColDesc, PgScalarName } from "@typesql/core/postgres/engine";

export type ColumnOverride = string | Partial<ColDesc>;

export type TableOverride = {
	readonly [column: string]: ColumnOverride | boolean;
};

export type KyselyOverrides = { readonly [table: string]: TableOverride };

export type KyselyOptions = { readonly camelCase?: boolean };

export type FromKysely<
	DB,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
> = {
	-readonly [K in (keyof DB & string) | "$types" as OuterKey<
		K,
		Options
	>]-?: K extends "$types"
		? EnumRegistry<DB, Overrides, Options>
		: K extends `public.${string}`
			? TableOf<DB, K, Overrides, Options>
			: K extends `${infer S}.${string}`
				? NamespaceOf<DB, S, Overrides, Options>
				: TableOf<DB, K, Overrides, Options>;
};

export type SnakeCase<S extends string> =
	S extends Lowercase<S>
		? S
		: S extends `${infer H}${infer R}`
			? SnakeRest<R, IsUpper<H>, Lowercase<H>>
			: S;

export type InferColumn<T> = {
	readonly type: PgTypeOf<
		NonNullable<Sel<T>>,
		Exclude<Hint<T>, null | undefined>,
		"enum"
	>;
	readonly nullable: null extends Sel<T> ? true : false;
	readonly hasDefault: HasDefault<T>;
};

type Sn<S extends string, Opt> = Opt extends { readonly camelCase: true }
	? SnakeCase<S>
	: S;

type IsUpper<C extends string> = C extends Lowercase<C> ? false : true;
type SnakeRest<
	S extends string,
	PrevUpper extends boolean,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? SnakeRest<
			R,
			IsUpper<C>,
			`${Acc}${IsUpper<C> extends true ? (PrevUpper extends true ? Lowercase<C> : `_${Lowercase<C>}`) : C}`
		>
	: Acc;

type OuterKey<K extends string, Opt> = K extends "$types"
	? K
	: K extends `public.${infer T}`
		? Sn<T, Opt>
		: K extends `${infer S}.${string}`
			? Sn<S, Opt>
			: Sn<K, Opt>;

type SqlTableName<K extends string, Opt> = K extends `public.${infer T}`
	? Sn<T, Opt>
	: Sn<K, Opt>;

type NamespaceOf<DB, S extends string, O, Opt> = {
	-readonly [K in keyof DB & `${S}.${string}` as K extends `${S}.${infer T}`
		? Sn<T, Opt>
		: never]-?: TableOf<DB, K, O, Opt>;
};

type TableOverrides<O, K> = K extends keyof O ? O[K] : undefined;
type ColumnOverrideOf<TO, C> = C extends keyof TO ? TO[C] : undefined;

type Registry<O> = O extends { readonly $types: infer R } ? R : {};

type TableOf<DB, K extends string, O, Opt> = K extends keyof DB
	? TableOverrides<O, K> extends { readonly $view: true }
		? View<
				Columns<
					DB[K],
					TableOverrides<O, K>,
					SqlTableName<K, Opt>,
					Registry<O>,
					Opt
				>
			>
		: Columns<
				DB[K],
				TableOverrides<O, K>,
				SqlTableName<K, Opt>,
				Registry<O>,
				Opt
			>
	: never;

type Columns<Tbl, TO, TName extends string, Reg, Opt> = {
	-readonly [C in keyof Tbl & string as Sn<C, Opt>]-?: Column<
		Tbl[C],
		ColumnOverrideOf<TO, C>,
		Reg,
		`${TName}.${Sn<C, Opt>}`
	>;
};

type Sel<T> = T extends { readonly __select__: infer S } ? InnerSel<S> : T;
type InnerSel<S> = S extends { readonly __select__: infer S2 } ? S2 : S;
type Hint<T> = T extends {
	readonly __select__: infer S;
	readonly __insert__: infer I;
}
	? InnerIns<S, I>
	: T;
type InnerIns<S, I> = S extends { readonly __insert__: infer I2 } ? I2 : I;
type Ins<T> = T extends { readonly __insert__: infer I } ? I : T;

type HasDefault<T> = [Extract<T, { readonly __insert__: unknown }>] extends [
	never,
]
	? false
	: undefined extends Ins<T>
		? true
		: [Exclude<Ins<T>, null>] extends [never]
			? true
			: false;

type LiteralUnion<S> = [S] extends [string]
	? string extends S
		? never
		: S
	: [S] extends [readonly (infer E)[]]
		? [NonNullable<E>] extends [string]
			? string extends NonNullable<E>
				? never
				: NonNullable<E>
			: never
		: never;

type PgTypeOf<S, H, E extends string> = unknown extends S
	? "jsonb"
	: [S] extends [never]
		? "text"
		: [S] extends [readonly (infer El)[]]
			? IsJsonInsert<H> extends true
				? "jsonb"
				: `${ScalarOf<ArrayElem<NonNullable<El>>, ArrayElem<ArrayElem<H>>, E>}[]`
			: ScalarOf<S, H, E>;

type IsJsonInsert<H> = [H] extends [never]
	? false
	: [Extract<H, readonly unknown[]>] extends [never]
		? true
		: false;

type ArrayElem<T> = T extends readonly (infer E)[] ? E : T;

type ScalarOf<S, H, E extends string> = unknown extends S
	? "jsonb"
	: [S] extends [string]
		? string extends S
			? StringKind<H>
			: E
		: [S] extends [number]
			? "int4"
			: [S] extends [bigint]
				? "int8"
				: [S] extends [boolean]
					? "bool"
					: [S] extends [Date]
						? "timestamptz"
						: [S] extends [Uint8Array]
							? "bytea"
							: [S] extends [readonly unknown[]]
								? "jsonb"
								: [S] extends [object]
									? ObjectKind<S>
									: "jsonb";

type StringKind<H> = [H] extends [never]
	? "text"
	: bigint extends H
		? "int8"
		: number extends H
			? "numeric"
			: "text";

type ObjectKind<S> = string extends keyof S
	? "jsonb"
	: "days" extends keyof S
		? "interval"
		: "radius" extends keyof S
			? "circle"
			: "x" | "y" extends keyof S
				? "point"
				: "jsonb";

type EnumName<U, Reg, Default extends string> =
	RegistryMatch<U, Reg> extends infer N extends string
		? [N] extends [never]
			? Default
			: IsSingle<N> extends true
				? N
				: Default
		: Default;
type RegistryMatch<U, Reg> = {
	[N in keyof Reg & string]: [U] extends [Reg[N]]
		? [Reg[N]] extends [U]
			? N
			: never
		: never;
}[keyof Reg & string];
type IsSingle<N, All = N> = N extends unknown
	? [Exclude<All, N>] extends [never]
		? true
		: false
	: never;

type OverrideType<V> = V extends string
	? V
	: V extends { readonly type: infer X extends string }
		? X
		: never;

type ColumnTypeName<T, V, Reg, Default extends string> = [
	OverrideType<V>,
] extends [never]
	? PgTypeOf<
			NonNullable<Sel<T>>,
			Exclude<Hint<T>, null | undefined>,
			EnumName<LiteralUnion<NonNullable<Sel<T>>>, Reg, Default>
		>
	: OverrideType<V>;

type Column<T, V, Reg, Default extends string> = {
	readonly type: ColumnTypeName<T, V, Reg, Default>;
	readonly nullable: [V] extends [
		{ readonly nullable: infer B extends boolean },
	]
		? B
		: null extends Sel<T>
			? true
			: false;
	readonly hasDefault: [V] extends [
		{ readonly hasDefault: infer B extends boolean },
	]
		? B
		: HasDefault<T>;
};

type BaseName<T extends string> = T extends `${infer B}[]` ? B : T;

type EnumEntry<T, V, Reg, Default extends string> = [
	LiteralUnion<NonNullable<Sel<T>>>,
] extends [never]
	? never
	: BaseName<ColumnTypeName<T, V, Reg, Default>> extends infer N extends string
		? N extends PgScalarName
			? never
			: [N, LiteralUnion<NonNullable<Sel<T>>>]
		: never;

type TableEnums<Tbl, TO, TName extends string, Reg, Opt> = {
	[C in keyof Tbl & string]-?: EnumEntry<
		Tbl[C],
		ColumnOverrideOf<TO, C>,
		Reg,
		`${TName}.${Sn<C, Opt>}`
	>;
}[keyof Tbl & string];

type EnumEntries<DB, O, Opt> =
	| {
			[N in keyof Registry<O> & string]: [N, Registry<O>[N]];
	  }[keyof Registry<O> & string]
	| {
			[K in keyof DB & string]-?: TableEnums<
				DB[K],
				TableOverrides<O, K>,
				SqlTableName<K, Opt>,
				Registry<O>,
				Opt
			>;
	  }[keyof DB & string];

type EnumRegistry<DB, O, Opt> = {
	[E in EnumEntries<DB, O, Opt> as E[0]]: E[1];
};
