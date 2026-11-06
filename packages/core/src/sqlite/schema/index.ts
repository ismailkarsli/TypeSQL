import type { FlaggedCol, Typed, TypeName } from "../../schema.js";

export type { Typed, View } from "../../schema.js";

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

export type Col<T extends TypeName, F extends ColFlags = {}> = FlaggedCol<
	T,
	F,
	"rowid",
	false
>;

/** A JSON column holding documents of type `T`. */
export type Json<T, F extends ColFlags = {}> = Col<Typed<"json", T>, F>;
