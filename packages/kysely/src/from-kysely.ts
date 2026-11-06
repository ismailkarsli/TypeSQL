import type { Col as MysqlCol } from "@typesql/core/mysql";
import type { Col, View } from "@typesql/core/postgres";
import type { ColDesc, PgScalarName } from "@typesql/core/postgres/engine";
// MySQL's `Typed` is the same type.
import type { Col as SqliteCol, Typed } from "@typesql/core/sqlite";

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
> = FromKyselyOf<DB, Overrides, Options, PgDialect>;

export type SnakeCase<S extends string> =
	S extends Lowercase<S>
		? S
		: S extends `${infer H}${infer R}`
			? SnakeRest<R, IsUpper<H>, Lowercase<H>>
			: S;

export type InferColumn<T> = Column<T, undefined, {}, "enum">;

/**
 * How a dialect reads a kysely-codegen schema: the column types it gives
 * the TypeScript types kysely-codegen writes, and its schemas.
 */
export interface KyselyDialect {
	readonly name: "postgres" | "sqlite" | "mysql";
	/** The schemas whose `"schema.table"` keys name a top-level table. */
	readonly defaultSchema: string;
	/** `"$types"` where enum columns name types of the schema. */
	readonly registry: string;
	/** `unknown`, which kysely-codegen writes for JSON. */
	readonly unknown: string;
	readonly never: string;
	readonly string: string;
	/** A string that inserts from a number: DECIMAL. */
	readonly numberString: string;
	/** A string that inserts from a bigint: BIGINT. */
	readonly bigintString: string;
	/** What a union of string literals is `Typed` on: an ENUM. */
	readonly literals: string;
	readonly number: string;
	readonly bigint: string;
	readonly boolean: string;
	readonly date: string;
	readonly bytes: string;
}

interface PgDialect extends KyselyDialect {
	readonly name: "postgres";
	readonly defaultSchema: "public";
	readonly registry: "$types";
	readonly unknown: "jsonb";
	readonly never: "text";
	readonly string: "text";
	readonly numberString: "numeric";
	readonly bigintString: "int8";
	readonly literals: "text";
	readonly number: "int4";
	readonly bigint: "int8";
	readonly boolean: "bool";
	readonly date: "timestamptz";
	readonly bytes: "bytea";
}

/**
 * The schema of a kysely-codegen `DB` in dialect `L`: a `"schema.table"`
 * key names a table of a namespace, `db.schema.table`, unless the schema is
 * the dialect's default one.
 */
export type FromKyselyOf<
	DB,
	Overrides extends KyselyOverrides,
	Options extends KyselyOptions,
	L extends KyselyDialect,
> = {
	-readonly [K in (keyof DB & string) | L["registry"] as OuterKey<
		K,
		Options,
		L
	>]-?: K extends "$types"
		? EnumRegistry<DB, Overrides, Options>
		: K extends `${L["defaultSchema"]}.${string}`
			? TableOf<DB, K, Overrides, Options, L>
			: K extends `${infer S}.${string}`
				? NamespaceOf<DB, S, Overrides, Options, L>
				: TableOf<DB, K, Overrides, Options, L>;
};

type FlatTypeOf<S, H, L extends KyselyDialect> = unknown extends S
	? L["unknown"]
	: [S] extends [never]
		? L["never"]
		: [S] extends [string]
			? string extends S
				? StringKind<H, L>
				: Typed<L["literals"], Literals<LiteralUnion<S> & string>>
			: [S] extends [number]
				? L["number"]
				: [S] extends [bigint]
					? L["bigint"]
					: [S] extends [boolean]
						? L["boolean"]
						: [S] extends [Date]
							? L["date"]
							: [S] extends [Uint8Array]
								? L["bytes"]
								: Typed<"json", S>;

type Literals<S extends string> = { [K in S]: K }[S];

/** A string column's type, from what it inserts from. */
type StringKind<H, L extends KyselyDialect> = [H] extends [never]
	? L["string"]
	: bigint extends H
		? L["bigintString"]
		: number extends H
			? L["numberString"]
			: L["string"];

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

type OuterKey<
	K extends string,
	Opt,
	L extends KyselyDialect,
> = K extends "$types"
	? K
	: K extends `${L["defaultSchema"]}.${infer T}`
		? Sn<T, Opt>
		: K extends `${infer S}.${string}`
			? Sn<S, Opt>
			: Sn<K, Opt>;

type SqlTableName<
	K extends string,
	Opt,
	L extends KyselyDialect,
> = K extends `${L["defaultSchema"]}.${infer T}` ? Sn<T, Opt> : Sn<K, Opt>;

type NamespaceOf<DB, S extends string, O, Opt, L extends KyselyDialect> = {
	-readonly [K in keyof DB & `${S}.${string}` as K extends `${S}.${infer T}`
		? Sn<T, Opt>
		: never]-?: TableOf<DB, K, O, Opt, L>;
};

type TableOverrides<O, K> = K extends keyof O ? O[K] : undefined;
type ColumnOverrideOf<TO, C> = C extends keyof TO ? TO[C] : undefined;

type Registry<O> = O extends { readonly $types: infer R } ? R : {};

type TableOf<
	DB,
	K extends string,
	O,
	Opt,
	L extends KyselyDialect,
> = K extends keyof DB
	? TableOverrides<O, K> extends { readonly $view: true }
		? View<
				Columns<
					DB[K],
					TableOverrides<O, K>,
					SqlTableName<K, Opt, L>,
					Registry<O>,
					Opt,
					L
				>
			>
		: Columns<
				DB[K],
				TableOverrides<O, K>,
				SqlTableName<K, Opt, L>,
				Registry<O>,
				Opt,
				L
			>
	: never;

// Each dialect's columns are a mapped type of their own: one whose column
// type depends on the dialect costs more to check.
type Columns<
	Tbl,
	TO,
	TName extends string,
	Reg,
	Opt,
	L extends KyselyDialect,
> = L["name"] extends "mysql"
	? MysqlColumns<Tbl, TO, Opt, L>
	: L["name"] extends "sqlite"
		? SqliteColumns<Tbl, TO, Opt, L>
		: PgColumns<Tbl, TO, TName, Reg, Opt>;

type PgColumns<Tbl, TO, TName extends string, Reg, Opt> = {
	-readonly [C in keyof Tbl & string as Sn<C, Opt>]-?: Column<
		Tbl[C],
		ColumnOverrideOf<TO, C>,
		Reg,
		`${TName}.${Sn<C, Opt>}`
	>;
};

type MysqlColumns<Tbl, TO, Opt, L extends KyselyDialect> = {
	-readonly [C in keyof Tbl & string as Sn<C, Opt>]-?: MysqlCol<
		FlatTypeName<Tbl[C], ColumnOverrideOf<TO, C>, L>,
		Flags<
			NullableOf<Tbl[C], ColumnOverrideOf<TO, C>>,
			HasDefaultOf<Tbl[C], ColumnOverrideOf<TO, C>>
		>
	>;
};

type SqliteColumns<Tbl, TO, Opt, L extends KyselyDialect> = {
	-readonly [C in keyof Tbl & string as Sn<C, Opt>]-?: SqliteCol<
		FlatTypeName<Tbl[C], ColumnOverrideOf<TO, C>, L>,
		Flags<
			NullableOf<Tbl[C], ColumnOverrideOf<TO, C>>,
			HasDefaultOf<Tbl[C], ColumnOverrideOf<TO, C>>
		>
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
			? StringKind<H, PgDialect>
			: E
		: [S] extends [number]
			? PgDialect["number"]
			: [S] extends [bigint]
				? PgDialect["bigint"]
				: [S] extends [boolean]
					? PgDialect["boolean"]
					: [S] extends [Date]
						? PgDialect["date"]
						: [S] extends [Uint8Array]
							? PgDialect["bytes"]
							: [S] extends [readonly unknown[]]
								? "jsonb"
								: [S] extends [object]
									? ObjectKind<S>
									: "jsonb";

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

type FlatTypeName<T, V, L extends KyselyDialect> = [OverrideType<V>] extends [
	never,
]
	? FlatTypeOf<NonNullable<Sel<T>>, Exclude<Hint<T>, null | undefined>, L>
	: OverrideType<V>;

type Column<T, V, Reg, Default extends string> = PgCol<
	ColumnTypeName<T, V, Reg, Default>,
	NullableOf<T, V>,
	HasDefaultOf<T, V>
>;

type PgCol<T extends string, N, H> = Col<T, Flags<N, H>>;

// One of four flag objects, so that columns of a type share one `Col`.
type Flags<N, H> = N extends true
	? H extends true
		? { nullable: true; hasDefault: true }
		: { nullable: true }
	: H extends true
		? { hasDefault: true }
		: Record<never, never>;

type NullableOf<T, V> = [V] extends [
	{ readonly nullable: infer B extends boolean },
]
	? B
	: null extends Sel<T>
		? true
		: false;

type HasDefaultOf<T, V> = [V] extends [
	{ readonly hasDefault: infer B extends boolean },
]
	? B
	: HasDefault<T>;

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
				SqlTableName<K, Opt, PgDialect>,
				Registry<O>,
				Opt
			>;
	  }[keyof DB & string];

type EnumRegistry<DB, O, Opt> = {
	[E in EnumEntries<DB, O, Opt> as E[0]]: E[1];
};
