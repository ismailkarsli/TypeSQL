export interface ColumnTypes {}

export type TypeName =
	| Extract<keyof ColumnTypes, string>
	| `${string}[]`
	| (string & {});

export type ColDesc = {
	readonly type: string;
	readonly nullable: boolean;
	readonly hasDefault: boolean;
};

/**
 * Column options as `Col` reads them. Read through a `-?` mapped type,
 * TypeScript cannot measure a variance for the options parameter, so two
 * columns with different options are compared by their resolved properties
 * (`nullable`, `hasDefault`, …) instead of by the options objects. Read as
 * plain `Flags extends { nullable: true }`, the parameter measures as
 * bivariant, and `Col<"int8", { nullable: true }>` was assignable to
 * `Col<"int8">` because `{ nullable: true }` is assignable to `{}`.
 */
type ColOptions<Flags> = { readonly [K in keyof Flags]-?: Flags[K] };

export type Col<T extends TypeName, Flags extends Partial<ColDesc> = {}> = {
	readonly type: T;
	readonly nullable: ColOptions<Flags> extends { nullable: true }
		? true
		: false;
	readonly hasDefault: ColOptions<Flags> extends { hasDefault: true }
		? true
		: false;
};

type IsSet<Flags, K extends string> =
	ColOptions<Flags> extends {
		readonly [P in K]: true;
	}
		? true
		: false;
// An unset flag is an optional `never` property, so a column that has the
// flag is not assignable to one that does not.
type Flag<Flags, K extends string> =
	IsSet<Flags, K> extends true
		? { readonly [P in K]: true }
		: { readonly [P in K]?: never };

/**
 * A MySQL or SQLite column: `Col` with its position and `generated` and
 * `hidden` flags, and the dialect's own flag `Own` (`autoIncrement`,
 * `rowid`), which implies a default where `OwnDefault` is true. A generated
 * column has a default too.
 */
export type FlaggedCol<
	T extends TypeName,
	Flags,
	Own extends string,
	OwnDefault extends boolean,
> = {
	readonly type: T;
	readonly nullable: IsSet<Flags, "nullable">;
	readonly hasDefault: IsSet<Flags, "hasDefault"> extends true
		? true
		: IsSet<Flags, "generated"> extends true
			? true
			: OwnDefault extends true
				? IsSet<Flags, Own>
				: false;
} & (ColOptions<Flags> extends { readonly position: infer P extends number }
	? { readonly i: P }
	: { readonly i?: never }) &
	Flag<Flags, Own> &
	Flag<Flags, "generated"> &
	Flag<Flags, "hidden">;

export type Enum<
	Name extends string,
	Flags extends Partial<ColDesc> = {},
> = Col<Name, Flags>;

export type Shaped<B extends string, S> = B & { readonly shape: S };
/** The shape of a value the schema gives a TypeScript type: `Typed<Base, T>`, `Json<T>`. */
export type TsShape<T> = { readonly k: "ts"; readonly v: T };
/** A type whose values are typed `T`. */
export type TsShaped<T> = { readonly shape: TsShape<T> };
/** A column of type `Base` whose values are typed `T`. */
export type Typed<Base extends string, T> = Shaped<Base, TsShape<T>>;

/** A type as TypeSQL's messages show it: `json` for `Json<T>`'s. */
export type ShapeBase<T extends string> = T extends {
	readonly shape: infer S;
}
	? // Matching the shape exactly leaves the base for B; matching any shape
		// would infer B as all of T.
		T extends Shaped<infer B extends string, S>
		? B
		: T
	: T;

/**
 * A JSON value of TypeScript type `T`, read or bound as the type map has a
 * plain JSON value (`Plain`): as text where that is a string, else as `T`.
 */
export type JsonAs<Plain, T> = [Plain] extends [string] ? Plain : T;

/** The parameter type map of type map `TM`: its `$params`, or `Default`. */
export type ParamMapOf<TM, Default> = TM extends {
	readonly $params: infer P;
}
	? P
	: Default;

/** A column's TypeScript type, given `V` for its non-null values. */
export type NullableTs<
	T extends { readonly type: string; readonly nullable: boolean },
	V,
> = T["type"] extends "null" ? null : T["nullable"] extends true ? V | null : V;

export type Table = { readonly [column: string]: ColDesc };

export type View<Cols extends Table> = { readonly $view: Cols };

export type TypeRegistry = { readonly [name: string]: string };

export type Namespace = { readonly [table: string]: Table | View<Table> };

/**
 * Keys of a schema that declare types (PostgreSQL's `$types`) and functions
 * (`$functions`, in every dialect), not relations.
 */
export const DECLARED_KEYS = ["$types", "$functions"] as const;
/**
 * Keys of a schema type that name no relation: the declared ones, the
 * null-parameter marker inference adds, and MariaDB's flag.
 */
export const META_KEYS = [...DECLARED_KEYS, "$nullParams", "$flavor"] as const;
export type MetaKey = (typeof META_KEYS)[number];

/** Whether a schema entry is a relation (a table or a view) rather than a namespace or a `$` key. */
export type IsRelation<X> = X extends { readonly $view: unknown }
	? true
	: X extends object
		? X[keyof X] extends { readonly type: string }
			? true
			: false
		: false;

export type RelCols<X> = X extends { readonly $view: infer C }
	? keyof C & string
	: keyof X & string;

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
