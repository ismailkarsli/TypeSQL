import type { ColOptions, Shaped, TsShape, TypeName } from "../../schema.js";

export type { View } from "../../schema.js";

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

// Options are read through ColOptions (see there) so columns with different
// options compare by these properties. An unset rowid, generated, hidden or
// position is an optional `never` property, so a column that has it is not
// assignable to one that does not.
export type Col<T extends TypeName, F extends ColFlags = {}> = {
	readonly type: T;
	readonly nullable: ColOptions<F> extends { nullable: true } ? true : false;
	readonly hasDefault: ColOptions<F> extends { hasDefault: true }
		? true
		: ColOptions<F> extends { generated: true }
			? true
			: false;
} & (ColOptions<F> extends { readonly position: infer P extends number }
	? { readonly i: P }
	: { readonly i?: never }) &
	(ColOptions<F> extends { readonly rowid: true }
		? { readonly rowid: true }
		: { readonly rowid?: never }) &
	(ColOptions<F> extends { readonly generated: true }
		? { readonly generated: true }
		: { readonly generated?: never }) &
	(ColOptions<F> extends { readonly hidden: true }
		? { readonly hidden: true }
		: { readonly hidden?: never });

export type Typed<Base extends string, T> = Shaped<Base, TsShape<T>>;

export type Json<T, F extends ColFlags = {}> = Col<Typed<"json", T>, F>;
