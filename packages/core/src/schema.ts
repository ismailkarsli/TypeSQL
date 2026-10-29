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

export type Col<T extends TypeName, Flags extends Partial<ColDesc> = {}> = {
	readonly type: T;
	readonly nullable: Flags extends { nullable: true } ? true : false;
	readonly hasDefault: Flags extends { hasDefault: true } ? true : false;
};

export type Nullable<T extends TypeName> = Col<T, { nullable: true }>;
export type Generated<T extends TypeName> = Col<T, { hasDefault: true }>;
export type NullableGenerated<T extends TypeName> = Col<
	T,
	{ nullable: true; hasDefault: true }
>;
export type Arr<T extends TypeName, Flags extends Partial<ColDesc> = {}> = Col<
	`${T}[]`,
	Flags
>;
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
