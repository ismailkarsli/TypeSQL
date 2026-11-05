import type { Typed, View } from "@typesql/core/mysql";
import type {
	ColumnOverrideOf,
	HasDefaultOf,
	Hint,
	KyselyOptions,
	KyselyOverrides,
	LiteralUnion,
	NullableOf,
	OverrideType,
	Sel,
	Sn,
	TableOverrides,
} from "./from-kysely.js";

export type FromKyselyMysql<
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
		? MysqlTypeOf<NonNullable<Sel<T>>, Exclude<Hint<T>, null | undefined>>
		: OverrideType<V>;
	readonly nullable: NullableOf<T, V>;
	readonly hasDefault: HasDefaultOf<T, V>;
};

// kysely-codegen types ENUM columns as unions of their values, BIGINT and
// DECIMAL as strings that insert from numbers, and JSON as `unknown`.
type MysqlTypeOf<S, H> = unknown extends S
	? "json"
	: [S] extends [never]
		? "varchar"
		: [S] extends [string]
			? string extends S
				? StringKind<H>
				: Typed<"enum", Literals<LiteralUnion<S> & string>>
			: [S] extends [number]
				? "int"
				: [S] extends [bigint]
					? "bigint"
					: [S] extends [boolean]
						? "tinyint"
						: [S] extends [Date]
							? "datetime"
							: [S] extends [Uint8Array]
								? "blob"
								: Typed<"json", S>;

type Literals<S extends string> = { [K in S]: K }[S];

type StringKind<H> = [H] extends [never]
	? "varchar"
	: bigint extends H
		? "bigint"
		: number extends H
			? "decimal"
			: "varchar";
