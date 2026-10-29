import type { Shaped, TsShape, TypeName } from "../../schema.js";

export type {
	ColDesc,
	Namespace,
	Table,
	View,
} from "../../schema.js";

export type SqliteTypeName =
	| "integer"
	| "int"
	| "real"
	| "text"
	| "blob"
	| "numeric"
	| "any"
	| (string & {});

export type ColFlags = {
	readonly nullable?: boolean;
	readonly hasDefault?: boolean;
	readonly position?: number;
	readonly rowid?: boolean;
	readonly generated?: boolean;
	readonly hidden?: boolean;
};

export type Col<T extends TypeName, F extends ColFlags = {}> = {
	readonly type: T;
	readonly nullable: F extends { nullable: true } ? true : false;
	readonly hasDefault: F extends { hasDefault: true }
		? true
		: F extends { generated: true }
			? true
			: false;
} & (F extends { readonly position: infer P extends number }
	? { readonly i: P }
	: {}) &
	(F extends { readonly rowid: true } ? { readonly rowid: true } : {}) &
	(F extends { readonly generated: true } ? { readonly generated: true } : {}) &
	(F extends { readonly hidden: true } ? { readonly hidden: true } : {});

export type Nullable<T extends TypeName> = Col<T, { nullable: true }>;
export type Generated<T extends TypeName> = Col<T, { hasDefault: true }>;
export type NullableGenerated<T extends TypeName> = Col<
	T,
	{ nullable: true; hasDefault: true }
>;

export type Typed<Base extends string, T> = Shaped<Base, TsShape<T>>;

export type Json<T, F extends ColFlags = {}> = Col<Typed<"json", T>, F>;
