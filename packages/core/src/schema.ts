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
export type ColOptions<Flags> = { readonly [K in keyof Flags]-?: Flags[K] };

export type Col<T extends TypeName, Flags extends Partial<ColDesc> = {}> = {
	readonly type: T;
	readonly nullable: ColOptions<Flags> extends { nullable: true }
		? true
		: false;
	readonly hasDefault: ColOptions<Flags> extends { hasDefault: true }
		? true
		: false;
};

export type Enum<
	Name extends string,
	Flags extends Partial<ColDesc> = {},
> = Col<Name, Flags>;

export type Shaped<B extends string, S> = B & { readonly shape: S };
export type TsShape<T> = { readonly k: "ts"; readonly v: T };

export type Table = { readonly [column: string]: ColDesc };

export type View<Cols extends Table> = { readonly $view: Cols };

export type TypeRegistry = { readonly [name: string]: string };

export type Namespace = { readonly [table: string]: Table | View<Table> };
