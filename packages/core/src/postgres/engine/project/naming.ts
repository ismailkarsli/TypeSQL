import type { Ctx } from "../../../engine/types.js";
import type { Expr, SelectStmt } from "../ast.js";
import type { ProjectSelect } from "./select.js";

export type ColumnName<
	E extends Expr,
	Alias extends string | null,
	C extends Ctx,
> = Alias extends string
	? Alias
	: Fig<E, C> extends infer N
		? N extends string
			? N
			: N extends { readonly weak: infer W }
				? W
				: "?column?"
		: never;

type Weak<N extends string> = { readonly weak: N };

type Fig<E extends Expr, C extends Ctx> = E extends TagCol
	? E["name"]
	: E extends Unnamed
		? null
		: E extends TagCall
			? E["name"]
			: E extends TagCast
				? Fig<E["e"], C> extends infer N
					? N extends string
						? N
						: Weak<StripArray<E["to"]>>
					: never
				: E extends TagTyped
					? E extends { readonly bits: true }
						? null
						: Weak<E["type"]>
					: E extends TagCase
						? E["else"] extends Expr
							? Fig<E["else"], C> extends infer N
								? N extends string
									? N
									: Weak<"case">
								: never
							: Weak<"case">
						: E extends TagExists
							? "exists"
							: E extends TagArrayArraysub
								? "array"
								: E extends TagRow
									? "row"
									: E extends TagSub
										? SubName<E["q"], C>
										: E extends TagExtract
											? "extract"
											: E extends TagPosition
												? "position"
												: E extends TagSubstring
													? "substring"
													: E extends TagTrim
														? E["side"] extends "leading"
															? "ltrim"
															: E["side"] extends "trailing"
																? "rtrim"
																: "btrim"
														: E extends TagOverlay
															? "overlay"
															: E extends TagAttz
																? "timezone"
																: E extends TagIdxSliceCollate
																	? Fig<E["e"], C>
																	: E extends TagField
																		? E["name"]
																		: E extends TagXml
																			? E["op"] extends "document"
																				? null
																				: `xml${E["op"]}`
																			: E extends TagJsonfnJsonagg
																				? E["fn"]
																				: null;

type StripArray<T extends string> = T extends `${infer B}[]` ? B : T;

type SubName<Q extends SelectStmt, C extends Ctx> =
	ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends readonly [{ readonly n: infer N }, ...unknown[]]
			? N
			: "?column?"
		: never;

type TagCol = { readonly t: "col" };
type TagCall = { readonly t: "call" };
type TagCast = { readonly t: "cast" };
type TagTyped = { readonly t: "typed" };
type TagCase = { readonly t: "case" };
type TagExists = { readonly t: "exists" };
type TagArrayArraysub = { readonly t: "array" | "arraysub" };
type TagRow = { readonly t: "row" };
type TagSub = { readonly t: "sub" };
type TagExtract = { readonly t: "extract" };
type TagPosition = { readonly t: "position" };
type TagSubstring = { readonly t: "substring" };
type TagTrim = { readonly t: "trim" };
type TagOverlay = { readonly t: "overlay" };
type TagAttz = { readonly t: "attz" };
type TagIdxSliceCollate = { readonly t: "idx" | "slice" | "collate" };
type TagField = { readonly t: "field" };
type TagXml = { readonly t: "xml" };
type TagJsonfnJsonagg = { readonly t: "jsonfn" | "jsonagg" };

type Unnamed = {
	readonly t:
		| "bin"
		| "param"
		| "num"
		| "str"
		| "bool"
		| "null"
		| "is"
		| "quant";
};
