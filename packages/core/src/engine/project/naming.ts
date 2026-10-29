import type { Expr, SelectStmt } from "../ast.js";
import type { Ctx } from "../types.js";
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

type Fig<E extends Expr, C extends Ctx> = E extends { readonly t: "col" }
	? E["name"]
	: E extends { readonly t: "call" }
		? E["name"]
		: E extends { readonly t: "cast" }
			? Fig<E["e"], C> extends infer N
				? N extends string
					? N
					: Weak<StripArray<E["to"]>>
				: never
			: E extends { readonly t: "typed" }
				? E extends { readonly bits: true }
					? null
					: Weak<E["type"]>
				: E extends { readonly t: "case" }
					? E["else"] extends Expr
						? Fig<E["else"], C> extends infer N
							? N extends string
								? N
								: Weak<"case">
							: never
						: Weak<"case">
					: E extends { readonly t: "exists" }
						? "exists"
						: E extends { readonly t: "array" | "arraysub" }
							? "array"
							: E extends { readonly t: "row" }
								? "row"
								: E extends { readonly t: "sub" }
									? SubName<E["q"], C>
									: E extends { readonly t: "extract" }
										? "extract"
										: E extends { readonly t: "position" }
											? "position"
											: E extends { readonly t: "substring" }
												? "substring"
												: E extends { readonly t: "trim" }
													? E["side"] extends "leading"
														? "ltrim"
														: E["side"] extends "trailing"
															? "rtrim"
															: "btrim"
													: E extends { readonly t: "overlay" }
														? "overlay"
														: E extends { readonly t: "attz" }
															? "timezone"
															: E extends {
																		readonly t: "idx" | "slice" | "collate";
																	}
																? Fig<E["e"], C>
																: E extends { readonly t: "field" }
																	? E["name"]
																	: E extends { readonly t: "xml" }
																		? E["op"] extends "document"
																			? null
																			: `xml${E["op"]}`
																		: E extends {
																					readonly t: "jsonfn" | "jsonagg";
																				}
																			? E["fn"]
																			: null;

type StripArray<T extends string> = T extends `${infer B}[]` ? B : T;

type SubName<Q extends SelectStmt, C extends Ctx> =
	ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends readonly [{ readonly n: infer N }, ...unknown[]]
			? N
			: "?column?"
		: never;
