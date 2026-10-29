import type { Typed, View } from "@typesql/core/sqlite";
import type {
	ColumnOverrideOf,
	HasDefault,
	Hint,
	KyselyOptions,
	KyselyOverrides,
	LiteralUnion,
	OverrideType,
	Sel,
	Sn,
	TableOverrides,
} from "./from-kysely.js";

export type FromKyselySqlite<
	DB,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
> = {
	-readonly [K in keyof DB & string as Sn<K, Options>]-?: TableOverrides<
		Overrides,
		K
	> extends { readonly $view: true }
		? View<Columns<DB[K], TableOverrides<Overrides, K>, Options>>
		: Columns<DB[K], TableOverrides<Overrides, K>, Options>;
};

type Columns<Tbl, TO, Opt> = {
	-readonly [C in keyof Tbl & string as Sn<C, Opt>]-?: Column<
		Tbl[C],
		ColumnOverrideOf<TO, C>
	>;
};

type Column<T, V> = {
	readonly type: [OverrideType<V>] extends [never]
		? SqliteTypeOf<NonNullable<Sel<T>>, Exclude<Hint<T>, null | undefined>>
		: OverrideType<V>;
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

type SqliteTypeOf<S, H> = unknown extends S
	? "any"
	: [S] extends [never]
		? "text"
		: [S] extends [string]
			? string extends S
				? StringKind<H>
				: Typed<"text", Literals<LiteralUnion<S> & string>>
			: [S] extends [number]
				? "numeric"
				: [S] extends [bigint]
					? "integer"
					: [S] extends [boolean]
						? "boolean"
						: [S] extends [Date]
							? "datetime"
							: [S] extends [Uint8Array]
								? "blob"
								: Typed<"json", S>;

type Literals<S extends string> = { [K in S]: K }[S];

type StringKind<H> = [H] extends [never]
	? "text"
	: bigint extends H
		? "integer"
		: number extends H
			? "numeric"
			: "text";
