import type {
	Call,
	Expr,
	FromItem,
	SelectBody,
	SelectStmt,
	SimpleSelect,
	Target,
} from "../ast.js";
import type { BindFrom } from "../binder/from.js";
import type { Toks } from "../lexer/tokens.js";
import type { BindWith } from "../project/select.js";
import type {
	ColInfo,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	Scope,
	ScopeLevel,
} from "../types.js";
import type { AnySig, LookupFn, PickSig } from "./catalog.js";
import type { CommonType, DateTimeT } from "./operators.js";
import type { ParamsOfJsonTable, ParamsOfSqlJson } from "./sqljson.js";
import type { TypeList, TypeOf } from "./typeof.js";
import type { ParamsOfXml, ParamsOfXmlTable } from "./xml.js";

/**
 * Parameter typing: a second pass over the AST that infers `$n` types from context.
 * `ParamMap` is `{ [n]: ColInfo | ColInfo | ... }` (a union when `$n` is used several
 * times; the TS types are intersected at the boundary).
 *
 * Rules (PLAN §6.7; parameter types verified with PREPARE on PostgreSQL 18):
 *   col <cmp> $1, $1 <cmp> col         → column type, nullable (comparisons, LIKE, regex,
 *                                        IS DISTINCT FROM; `col = NULL` is legal, it matches nothing)
 *   col <arith> $1, col || $1          → column type (text for `||`), nullable iff the column is;
 *                                        date/time - $1 → same type (Postgres tries the
 *                                        same-type operator first), + $1 → interval;
 *                                        interval * $1 → float8
 *   json -> $1 / ->> $1 / ? $1         → text;  #> #>> ?| ?& → text[] (nullable)
 *   $1 AND/OR x, NOT $1, CASE WHEN $1  → bool
 *   col IN ($1, $2) / $1 IN (a, b)     → element type / common type of the list
 *   col = ANY($1) / $1 = ANY(arr)      → array of the column type / element type
 *   $1 BETWEEN a AND b                 → a's type (Postgres resolves `$1 >= a` first)
 *   CASE branches, COALESCE siblings, ARRAY[...] → common type of the siblings
 *   f($1) with a catalog signature     → the parameter's type (nullable); polymorphic `any`/`...`
 *                                        → common type of the other polymorphic arguments,
 *                                        array arguments contributing their element type
 *                                        (`array_append(nums, $1)` → int4)
 *   SUBSTRING(x FROM $1)               → text (Postgres picks the regex form); FROM 1 FOR $1 → int4
 *   $1::T                              → T (cast beats context), nullable iff the context's type
 *                                        is (`coalesce($1::text, 'x')` accepts null, `VALUES ($1::text)`
 *                                        for a NOT NULL column does not); non-null without context
 *   $1 IS [NOT] NULL, $1::T IS NULL    → adds `| null` to the intersection of the other uses
 *   LIMIT $1, OFFSET $1                → int4 (number), nullable (`LIMIT NULL` = no limit)
 *   no context                         → unknown
 */
export type ParamMap = { readonly [n: number]: ColInfo };

/** One `$n` occurrence and the type its context gives it. */
export type ParamEntry<N extends number = number, T = ColInfo> = {
	readonly n: N;
	readonly t: T;
};

/**
 * The pass accumulates a flat union of `ParamEntry`s (start with `never`). A nested mapped
 * type per occurrence capped statements at ~48 `$n` uses; a union has no nesting.
 * `ParamsToMap` collapses it into `{ [n]: ColInfo | … }` once, at the end.
 */
export type AddParam<M, N extends number, T> = M | ParamEntry<N, T>;

export type ParamsToMap<U> = {
	readonly [E in U as E extends { readonly n: infer N extends number }
		? N
		: never]: E extends { readonly t: infer T } ? T : never;
};

/**
 * Highest `$n` in the token stream (0 if none). Extract parameters from the token
 * union first: most tokens are not parameters, and need no per-token instantiation.
 */
export type MaxParam<T extends Toks> = HighestParam<
	Extract<T[number], { readonly k: "$" }>["v"] | 0
>;

/** Only the largest candidate has no larger member outside its preceding integers. */
type HighestParam<N extends number, All extends number = N> = N extends number // type-mutate: equivalent cond-true – N is constrained to number; this conditional distributes its members, and its false branch is unreachable
	? Exclude<All, Before<N>> extends N
		? N
		: never
	: never;
type Before<N extends number, A extends number[] = []> = A["length"] extends N
	? A[number]
	: Before<N, [...A, A["length"]]>;

/** Marks a `$n` that the statement tests with `IS [NOT] NULL`: the caller may pass null. */
export type NullTest = {
	readonly type: "unknown";
	readonly nullable: true; // type-mutate: equivalent bool-flip – a tag: producers and consumers match NullTest itself
	readonly nullTest: true; // type-mutate: equivalent bool-flip – a tag: producers and consumers match NullTest itself
};
type NullTested<E extends Expr, M> = E extends {
	readonly t: "param";
	readonly n: infer N extends number;
}
	? AddParam<M, N, NullTest>
	: E extends {
				readonly t: "cast";
				readonly e: { readonly t: "param"; readonly n: infer N extends number };
			}
		? AddParam<M, N, NullTest>
		: M;

/** Comparison and pattern operators: the other operand's type, nullable (`WHERE id = $1` → `number | null`). */
type IsComparison<Op extends string> = Op extends // type-mutate: equivalent never-true – read with extends true, never counts as true
	| "="
	| "<"
	| ">"
	| "<="
	| ">="
	| "<>"
	| "!="
	| "~"
	| "~*"
	| "!~"
	| "!~*"
	| "~~"
	| "~~*"
	| "!~~"
	| "!~~*"
	? true
	: false;
type NullableOf<T> = T extends ColInfo
	? Mk<T["type"], true>
	: Mk<"unknown", true>; // type-mutate: equivalent bool-flip never-false – an operand with an error: the main pass rejects the statement
/** Unconstrained `Info` for computed type names (avoids constraint resolution of recursive aliases). */
type Mk<T, N extends boolean> = { readonly type: T; readonly nullable: N };

/** Collect params from an expression. Errors in sibling typing are ignored (they are reported by the main pass). */
export type ParamsOfExpr<E extends Expr, C extends Ctx, M> = E extends {
	// type-mutate: equivalent cond-false – a bare parameter reaches the last branch, which returns M too
	readonly t: "param";
}
	? M
	: E extends { readonly t: "bin" }
		? ParamsOfBin<E["op"], E["l"], E["r"], C, M>
		: E extends { readonly t: "un" }
			? E["e"] extends {
					readonly t: "param";
					readonly n: infer N extends number;
				}
				? E["op"] extends "not"
					? AddParam<M, N, Info<"bool", true>>
					: M
				: ParamsOfExpr<E["e"], C, M>
			: E extends { readonly t: "cast" }
				? E["e"] extends {
						readonly t: "param";
						readonly n: infer N extends number;
					}
					? AddParam<M, N, Info<E["to"], false>>
					: E["e"] extends {
								readonly t: "array";
								readonly items: infer Items extends readonly Expr[];
							}
						? E["to"] extends `${infer El}[]`
							? CastArrayParams<Items, C, M, El>
							: ParamsOfExpr<E["e"], C, M>
						: ParamsOfExpr<E["e"], C, M>
				: E extends { readonly t: "call" }
					? ParamsOfCall<Extract<E, Call>, C, M>
					: E extends { readonly t: "case" }
						? ParamsOfCase<E["operand"], E["whens"], E["else"], C, M>
						: E extends { readonly t: "is" }
							? E["what"] extends "null"
								? NullTested<E["e"], ParamsOfExpr<E["e"], C, M>>
								: ParamsOfExpr<E["e"], C, M>
							: E extends { readonly t: "isdistinct" }
								? ParamsOfBin<"=", E["l"], E["r"], C, M>
								: E extends { readonly t: "between" }
									? E["e"] extends {
											readonly t: "param";
											readonly n: infer N extends number;
										}
										? ParamsOfList<
												[E["lo"], E["hi"]], // type-mutate: equivalent tuple-swap – every item gets the same type
												C,
												AddParam<M, N, Mk<CommonOfExprs<[E["lo"]], C>, true>>,
												null
											>
										: ParamsOfList<
												[E["lo"], E["hi"]], // type-mutate: equivalent tuple-swap – every item gets the same type
												C,
												ParamsOfExpr<E["e"], C, M>,
												NullableOf<TypeOf<E["e"], C>>
											>
									: E extends { readonly t: "in" }
										? E["e"] extends {
												readonly t: "param";
												readonly n: infer N extends number;
											}
											? ParamsOfList<
													E["list"],
													C,
													AddParam<M, N, Mk<CommonOfExprs<E["list"], C>, true>>,
													null
												>
											: ParamsOfList<
													E["list"],
													C,
													ParamsOfExpr<E["e"], C, M>,
													NullableOf<TypeOf<E["e"], C>>
												>
										: E extends { readonly t: "insub" }
											? ParamsOfSelect<
													E["q"],
													C["db"],
													C["scope"],
													C["ctes"],
													ParamsOfExpr<E["e"], C, M>
												>
											: E extends { readonly t: "like" }
												? ParamsOfList<
														[E["e"], E["pat"]], // type-mutate: equivalent tuple-swap – every item gets the same type
														C,
														M,
														Info<"text", true>
													>
												: E extends { readonly t: "quant" }
													? ParamsOfQuant<E["l"], E["r"], C, M>
													: E extends { readonly t: "sub" }
														? ParamsOfSelect<
																E["q"],
																C["db"],
																C["scope"],
																C["ctes"],
																M
															>
														: E extends { readonly t: "exists" }
															? ParamsOfSelect<
																	E["q"],
																	C["db"],
																	C["scope"],
																	C["ctes"],
																	M
																>
															: E extends { readonly t: "arraysub" }
																? ParamsOfSelect<
																		E["q"],
																		C["db"],
																		C["scope"],
																		C["ctes"],
																		M
																	>
																: E extends { readonly t: "array" }
																	? ParamsOfList<
																			E["items"],
																			C,
																			M,
																			Mk<
																				UntypedText<
																					CommonOfExprs<E["items"], C>
																				>,
																				true
																			>
																		>
																	: E extends { readonly t: "row" }
																		? ParamsOfList<E["items"], C, M, null>
																		: E extends { readonly t: "idx" }
																			? ParamsOfList<
																					[E["i"]],
																					C,
																					ParamsOfExpr<E["e"], C, M>,
																					Info<"int4">
																				>
																			: E extends { readonly t: "slice" }
																				? ParamsOfOpt<
																						E["hi"],
																						C,
																						ParamsOfOpt<
																							E["lo"],
																							C,
																							ParamsOfExpr<E["e"], C, M>,
																							Info<"int4">
																						>,
																						Info<"int4">
																					>
																				: E extends { readonly t: "extract" }
																					? ParamsOfOpt<
																							E["e"],
																							C,
																							M,
																							Info<"timestamptz", true>
																						>
																					: E extends { readonly t: "position" }
																						? ParamsOfList<
																								[E["sub"], E["in"]], // type-mutate: equivalent tuple-swap – every item gets the same type
																								C,
																								M,
																								Info<"text", true>
																							>
																						: E extends {
																									readonly t: "substring";
																								}
																							? SubstrPosType<
																									E["e"],
																									E["from"],
																									E["for"],
																									C
																								> extends infer PT
																								? ParamsOfOpt<
																										E["for"],
																										C,
																										ParamsOfOpt<
																											E["from"],
																											C,
																											ParamsOfOpt<
																												E["e"],
																												C,
																												M,
																												Info<"text", true>
																											>,
																											PT
																										>,
																										PT
																									>
																								: never
																							: E extends { readonly t: "trim" }
																								? ParamsOfOpt<
																										E["chars"],
																										C,
																										ParamsOfOpt<
																											E["e"],
																											C,
																											M,
																											Info<"text", true>
																										>,
																										Info<"text", true>
																									>
																								: E extends {
																											readonly t: "overlay";
																										}
																									? ParamsOfOpt<
																											E["for"],
																											C,
																											ParamsOfOpt<
																												E["from"],
																												C,
																												ParamsOfOpt<
																													E["placing"],
																													C,
																													ParamsOfOpt<
																														E["e"],
																														C,
																														M,
																														Info<"text", true>
																													>,
																													Info<"text", true>
																												>,
																												Info<"int4", true>
																											>,
																											Info<"int4", true>
																										>
																									: E extends {
																												readonly t: "attz";
																											}
																										? ParamsOfOpt<
																												E["zone"],
																												C,
																												ParamsOfOpt<
																													E["e"],
																													C,
																													M,
																													Info<
																														"timestamptz",
																														true
																													>
																												>,
																												Info<"text", true>
																											>
																										: E extends {
																													readonly t: "collate";
																												}
																											? ParamsOfExpr<
																													E["e"],
																													C,
																													M
																												>
																											: E extends {
																														readonly t: "field";
																													}
																												? ParamsOfExpr<
																														E["e"],
																														C,
																														M
																													>
																												: E extends {
																															readonly t: "xml";
																														}
																													? ParamsOfXml<E, C, M>
																													: E extends {
																																readonly t:
																																	| "jsonfn"
																																	| "jsonagg"
																																	| "isjson"
																																	| "jsonfmt";
																															}
																														? ParamsOfSqlJson<
																																E,
																																C,
																																M
																															>
																														: // `f(name => $1)`: the parameter's position is unknown (the catalog has no names), so it stays untyped
																															E extends {
																																	readonly t:
																																		| "named"
																																		| "variadic";
																																}
																															? ParamsOfExpr<
																																	E["e"],
																																	C,
																																	M
																																>
																															: M;

/**
 * Type of a `$n` in SUBSTRING's FROM / FOR. With an unknown argument Postgres prefers the
 * string category, i.e. the regex form `substring(text, text [, text])`, unless the other
 * position is an integer (`FROM 1 FOR $1` → int4; there is no form for a bigint or numeric),
 * or there is no FROM (`FOR $1` is `FROM 1 FOR $1`).
 * bytea / bit strings only have the integer form.
 */
type SubstrPosType<
	S extends Expr,
	From extends Expr | null,
	For extends Expr | null,
	C extends Ctx,
> =
	TypeOf<S, C> extends { readonly type: "bytea" | "bit" | "varbit" }
		? Info<"int4", true>
		: From extends null
			? Info<"int4", true> // `FOR n` alone is `substring(s, 1, n)`
			: (From extends { readonly t: "param" } ? For : From) extends infer Sib
				? Sib extends Expr
					? TypeOf<Sib, C> extends { readonly type: "int2" | "int4" }
						? Info<"int4", true>
						: Info<"text", true>
					: Info<"text", true>
				: never;

/**
 * A param in `E` gets type `T` (when `T` is not null); a cast param `$n::X` gets `X` with
 * `T`'s nullability; otherwise recurse.
 */
export type ParamsOfOpt<
	E extends Expr | null,
	C extends Ctx,
	M,
	T,
> = E extends { readonly t: "param"; readonly n: infer N extends number }
	? T extends ColInfo
		? AddParam<M, N, T>
		: M
	: E extends {
				readonly t: "cast";
				readonly e: { readonly t: "param"; readonly n: infer N extends number };
			}
		? T extends ColInfo
			? AddParam<M, N, Mk<E["to"], T["nullable"]>>
			: ParamsOfExpr<E, C, M>
		: E extends Expr
			? ParamsOfExpr<E, C, M>
			: M;

export type ParamsOfList<
	Es extends readonly Expr[],
	C extends Ctx,
	M,
	T,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? ParamsOfList<R, C, ParamsOfOpt<E, C, M, T>, T>
	: M;

/** An `ARRAY[…]` of parameters (and NULLs) only is text[], as in Postgres. */
type UntypedText<T> = T extends "unknown" ? "text" : T;
/** `ARRAY[…]::T[]`: the parameters in it, in arrays inside it too, are `T`. */
type CastArrayParams<
	Items extends readonly Expr[],
	C extends Ctx,
	M,
	El extends string,
> = Items extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? CastArrayParams<
			R,
			C,
			E extends {
				readonly t: "array";
				readonly items: infer I extends readonly Expr[];
			}
				? CastArrayParams<I, C, M, El>
				: ParamsOfOpt<E, C, M, Mk<El, true>>,
			El
		>
	: M;

/** Common type of the non-NULL expressions of a list ("unknown" if none or on error; a parameter is unknown too). */
type CommonOfExprs<Es extends readonly Expr[], C extends Ctx> =
	TypeList<NonParams<Es, []>, C, []> extends infer Ts
		? Ts extends readonly ColInfo[]
			? CommonOfInfos<Ts, "unknown">
			: "unknown" // type-mutate: equivalent never-false – an item with an error: the main pass rejects the statement
		: never;
type NonParams<
	Es extends readonly Expr[],
	Acc extends readonly Expr[],
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? E extends { readonly t: "null" }
		? NonParams<R, Acc>
		: NonParams<R, [...Acc, E]>
	: Acc;
type CommonOfInfos<
	Ts extends readonly ColInfo[],
	Acc extends string,
> = Ts extends readonly [
	infer T extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? CommonOfInfos<R, CommonType<Acc, T["type"]>>
	: Acc;

// ─── binary operators ───

type ParamsOfBin<
	Op extends string,
	L extends Expr,
	R extends Expr,
	C extends Ctx,
	M,
> = L extends { readonly t: "param"; readonly n: infer N extends number }
	? R extends { readonly t: "param" }
		? Op extends "and" | "or"
			? AddParam<AddParam<M, N, Info<"bool", true>>, R["n"], Info<"bool", true>>
			: M
		: AddParam<
				ParamsOfOperand<Op, R, L, C, M>,
				N,
				BinParamType<Op, TypeOf<R, C>>
			>
	: R extends { readonly t: "param"; readonly n: infer N extends number }
		? AddParam<
				ParamsOfOperand<Op, L, R, C, M>,
				N,
				BinParamType<Op, TypeOf<L, C>>
			>
		: // a cast param operand (`col = $1::uuid`) gets its cast type with the operator's nullability;
			// inline here (not through ParamsOfOperand) so operator chains do not nest one more alias per term
			L extends {
					readonly t: "cast";
					readonly to: infer T;
					readonly e: {
						readonly t: "param";
						readonly n: infer N extends number;
					};
				}
			? AddParam<
					ParamsOfOperand<Op, R, L, C, M>,
					N,
					Mk<T, BinNullable<Op, R, C>>
				>
			: R extends {
						readonly t: "cast";
						readonly to: infer T;
						readonly e: {
							readonly t: "param";
							readonly n: infer N extends number;
						};
					}
				? AddParam<ParamsOfExpr<L, C, M>, N, Mk<T, BinNullable<Op, L, C>>>
				: ParamsOfExpr<R, C, ParamsOfExpr<L, C, M>>;
type ParamsOfOperand<
	Op extends string,
	X extends Expr,
	Other extends Expr,
	C extends Ctx,
	M,
> = X extends {
	readonly t: "cast";
	readonly to: infer T;
	readonly e: { readonly t: "param"; readonly n: infer N extends number };
}
	? AddParam<M, N, Mk<T, BinNullable<Op, Other, C>>>
	: ParamsOfExpr<X, C, M>;
/** Nullability `BinParamType` gives a param operand next to `Other`. */
type BinNullable<Op extends string, Other extends Expr, C extends Ctx> =
	BinParamType<Op, TypeOf<Other, C>> extends {
		readonly nullable: infer Nl extends boolean;
	}
		? Nl
		: true; // type-mutate: equivalent never-false bool-flip – BinParamType always has a boolean nullability

/**
 * Type of a `$n` operand given the operator and the other operand's (possibly erroneous)
 * type. `Other` is deliberately unconstrained (ENGINE.md pitfall 9).
 */
type BinParamType<Op extends string, Other> = Other extends {
	readonly type: infer OT;
	readonly nullable: boolean;
}
	? IsComparison<Op> extends true
		? Mk<OT, true>
		: Op extends "and" | "or"
			? Info<"bool", true>
			: Op extends "->" | "->>" | "?"
				? Info<"text", true>
				: Op extends "#>" | "#>>" | "?|" | "?&"
					? Info<"text[]", true>
					: Op extends "@?" | "@@"
						? OT extends "jsonb"
							? Info<"text", true>
							: OT extends "tsvector"
								? Info<"tsquery", true>
								: OT extends "tsquery"
									? Info<"tsvector", true>
									: Other
						: Op extends "+" | "-"
							? OT extends DateTimeT
								? Mk<
										Op extends "-"
											? OT extends "timetz"
												? "interval"
												: OT
											: "interval",
										Other["nullable"]
									>
								: OT extends "jsonb"
									? Mk<"text", Other["nullable"]>
									: Other
							: Op extends "*" | "/"
								? OT extends "interval"
									? Mk<"float8", Other["nullable"]>
									: Other
								: Op extends "||"
									? OT extends
											| "jsonb"
											| "bytea"
											| "tsvector"
											| "tsquery"
											| `${string}[]`
										? Other
										: Mk<"text", Other["nullable"]>
									: Other
	: Mk<"unknown", true>; // type-mutate: equivalent never-false bool-flip – an operand with an error: the main pass rejects the statement

type ParamsOfQuant<
	L extends Expr,
	R extends SelectStmt | Expr,
	C extends Ctx,
	M,
> = R extends { readonly t: "param"; readonly n: infer N extends number }
	? AddParam<
			ParamsOfExpr<L, C, M>,
			N,
			TypeOf<L, C> extends infer LT
				? LT extends ColInfo
					? Mk<`${LT["type"]}[]`, true>
					: Mk<"unknown", true> // type-mutate: equivalent never-false bool-flip – an operand with an error: the main pass rejects the statement
				: never
		>
	: R extends {
				readonly t: "cast";
				readonly to: infer T;
				readonly e: { readonly t: "param"; readonly n: infer N extends number };
			}
		? AddParam<ParamsOfExpr<L, C, M>, N, Mk<T, true>>
		: L extends { readonly t: "param"; readonly n: infer N extends number }
			? R extends SelectStmt
				? ParamsOfSelect<R, C["db"], C["scope"], C["ctes"], M>
				: R extends Expr
					? AddParam<
							ParamsOfExpr<R, C, M>,
							N,
							TypeOf<R, C> extends infer RT
								? RT extends { readonly type: `${infer El}[]` }
									? Mk<El, true>
									: Mk<"unknown", true> // type-mutate: equivalent never-false bool-flip – ANY of a non-array: the main pass rejects the statement
								: never
						>
					: M // type-mutate: equivalent never-false – R is a SelectStmt or an Expr
			: R extends SelectStmt
				? ParamsOfSelect<
						R,
						C["db"],
						C["scope"],
						C["ctes"],
						ParamsOfExpr<L, C, M>
					>
				: R extends Expr
					? ParamsOfExpr<R, C, ParamsOfExpr<L, C, M>>
					: M; // type-mutate: equivalent never-false – R is a SelectStmt or an Expr

// ─── CASE ───

type ParamsOfCase<
	Operand extends Expr | null,
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	C extends Ctx,
	M,
> = ParamsOfOpt<
	Else,
	C,
	ParamsOfWhens<
		Whens,
		C,
		ParamsOfOpt<Operand, C, M, null>,
		Operand extends Expr ? NullableOf<TypeOf<Operand, C>> : Info<"bool", true>,
		Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
	>,
	Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
>;
type ThenExprs<
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	Acc extends readonly Expr[],
> = Whens extends readonly [
	infer W extends { when: Expr; then: Expr },
	...infer R extends readonly { when: Expr; then: Expr }[],
]
	? ThenExprs<R, Else, [...Acc, W["then"]]>
	: Else extends Expr
		? [...Acc, Else]
		: Acc;
type ParamsOfWhens<
	Whens extends readonly { when: Expr; then: Expr }[],
	C extends Ctx,
	M,
	WT,
	TT,
> = Whens extends readonly [
	infer W extends { when: Expr; then: Expr },
	...infer R extends readonly { when: Expr; then: Expr }[],
]
	? ParamsOfWhens<
			R,
			C,
			ParamsOfOpt<W["then"], C, ParamsOfOpt<W["when"], C, M, WT>, TT>,
			WT,
			TT
		>
	: M;

// ─── calls ───

/**
 * Function arguments: the overload is resolved from the non-param argument types (params
 * match anything), then each `$n` takes the type of its parameter pattern. Polymorphic
 * parameters (`any`, `...`) use the common type of the other arguments; `anyarray` stays
 * unknown. Unknown functions give no type.
 */
type ParamsOfCall<E extends Call, C extends Ctx, M> =
	LookupFn<C["db"], E["name"]> extends infer O
		? O extends null // type-mutate: equivalent cond-false never-true – an unknown function: the main pass rejects the statement
			? ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>>
			: TypeList<NonStarArgs<E["args"]>, C, []> extends infer As
				? As extends readonly ColInfo[]
					? PickSig<O, As> extends infer S
						? S extends AnySig
							? ParamsOfCallRest<
									E,
									C,
									ParamsOfArgs<
										E["args"],
										S["args"],
										C,
										M,
										PolyOf<E["args"], S["args"], C, "unknown">
									>
								>
							: ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>> // type-mutate: equivalent never-false – no signature matches: the main pass rejects the statement
						: never
					: ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>> // type-mutate: equivalent never-false – an argument with an error: the main pass rejects the statement
				: never
		: never;
type NonStarArgs<Args extends readonly Expr[]> = Args extends readonly [
	// type-mutate: equivalent cond-false – count(*) has no parameter either way
	{ readonly t: "star"; readonly tbl: null },
]
	? []
	: Args;
/** FILTER (WHERE $1) → bool; WITHIN GROUP (ORDER BY $1) → unknown. */
type ParamsOfCallRest<E extends Call, C extends Ctx, M> = ParamsOfOpt<
	E["withinGroup"],
	C,
	ParamsOfOpt<E["filter"], C, M, Info<"bool", true>>,
	null
>;

/**
 * Common type of the non-param arguments in polymorphic positions (`any`, `...`), with
 * arguments in `anyarray` positions contributing their element type — Postgres's
 * `anycompatible` unification. "unknown" when nothing is known.
 */
type PolyOf<
	Args extends readonly Expr[],
	Ps extends readonly string[],
	C extends Ctx,
	Acc extends string,
> = Args extends readonly [
	infer A extends Expr,
	...infer AR extends readonly Expr[],
]
	? Ps extends readonly [
			infer P extends string,
			...infer PR extends readonly string[],
		]
		? PolyOf<
				AR,
				P extends "..." ? Ps : PR,
				C,
				A extends { readonly t: "null" } ? Acc : PolyStep<P, TypeOf<A, C>, Acc>
			>
		: Acc // type-mutate: equivalent never-false – the signature takes every argument
	: Acc;
type PolyStep<P extends string, T, Acc extends string> = T extends {
	readonly type: infer AT extends string;
}
	? P extends "any" | "..."
		? CommonType<Acc, AT>
		: P extends "anyarray"
			? AT extends `${infer El}[]`
				? CommonType<Acc, El>
				: Acc
			: Acc
	: Acc; // type-mutate: equivalent never-false – an argument with an error: the main pass rejects the statement

/** `Poly` is unconstrained: it is a recursive alias result (ENGINE.md pitfall 9). */
type ParamsOfArgs<
	Args extends readonly Expr[],
	Ps extends readonly string[],
	C extends Ctx,
	M,
	Poly,
> = Args extends readonly [
	infer A extends Expr,
	...infer AR extends readonly Expr[],
]
	? Ps extends readonly [
			infer P extends string,
			...infer PR extends readonly string[],
		]
		? ParamsOfArgs<
				AR,
				P extends "..." ? Ps : PR, // type-mutate: equivalent cond-false – past the last pattern an argument gets Poly, as "..." gives
				C,
				ParamsOfOpt<A, C, M, PatternType<P, Poly>>,
				Poly
			>
		: ParamsOfArgs<AR, [], C, ParamsOfOpt<A, C, M, Mk<Poly, true>>, Poly> // type-mutate: equivalent never-false bool-flip – a variadic signature keeps its "...", the others match the arity
	: M;
type PatternType<P extends string, Poly> = P extends "any" | "..."
	? Mk<Poly, true>
	: P extends "anyarray"
		? Mk<
				Poly extends "unknown"
					? "unknown"
					: Poly extends `${string}[]` // type-mutate: equivalent never-true cond-false – an array in a polymorphic position next to anyarray: Postgres rejects it (could not find array type)
						? Poly
						: Poly extends string
							? `${Poly}[]`
							: "unknown", // type-mutate: equivalent never-false – Poly is a type name
				true
			>
		: P extends "anystring" | "jsonpath"
			? Info<"text", true>
			: // the preferred type of the category, as Postgres resolves an unknown (an anyjson
				// parameter has an anystring twin listed first)
				P extends "anynumeric"
				? Info<"float8", true>
				: P extends "anydatetime"
					? Info<"timestamptz", true>
					: P extends "anyrange"
						? Info<"unknown", true>
						: Mk<P, true>;

// ─── statements ───

export type ParamsOfTargets<
	Ts extends readonly Target[],
	C extends Ctx,
	M,
> = Ts extends readonly [
	infer T extends Target,
	...infer R extends readonly Target[],
]
	? ParamsOfTargets<R, C, ParamsOfExpr<T["e"], C, M>>
	: M;

export type ParamsOfFromItems<
	Fs extends readonly FromItem[],
	C extends Ctx,
	M,
> = Fs extends readonly [
	infer F extends FromItem,
	...infer R extends readonly FromItem[],
]
	? ParamsOfFromItems<R, C, ParamsOfFromItem<F, C, M>>
	: M;
type ParamsOfFromItem<F extends FromItem, C extends Ctx, M> = F extends {
	readonly t: "join";
}
	? ParamsOfOpt<
			F["on"],
			C,
			ParamsOfFromItem<F["r"], C, ParamsOfFromItem<F["l"], C, M>>,
			Info<"bool">
		>
	: F extends { readonly t: "sub" }
		? ParamsOfSelect<F["q"], C["db"], C["scope"], C["ctes"], M>
		: F extends { readonly t: "func" }
			? ParamsOfExpr<F["call"], C, M>
			: F extends { readonly t: "xmltable" }
				? ParamsOfXmlTable<F, C, M>
				: F extends { readonly t: "jsontable" }
					? ParamsOfJsonTable<F["jt"], C, M>
					: F extends { readonly t: "sample" }
						? ParamsOfOpt<
								F["repeatable"],
								C,
								ParamsOfList<
									F["args"],
									C,
									M,
									Info<
										F["method"] extends "system_rows"
											? "int8"
											: F["method"] extends "system_time"
												? "float8"
												: "float4"
									>
								>,
								Info<"float8">
							>
						: F extends { readonly t: "rowsfrom" }
							? ParamsOfRowsFrom<F["funcs"], C, M>
							: M;
type ParamsOfRowsFrom<
	Fs extends readonly { readonly call: Expr }[],
	C extends Ctx,
	M,
> = Fs extends readonly [
	infer F extends { readonly call: Expr },
	...infer R extends readonly { readonly call: Expr }[],
]
	? ParamsOfRowsFrom<R, C, ParamsOfExpr<F["call"], C, M>>
	: M;

export type ParamsOfSelect<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M,
> =
	BindWith<Q["with"], DB, Outer, Ctes> extends infer C2
		? C2 extends CteMap
			? ParamsOfLimit<
					Q["offset"],
					ParamsOfLimit<Q["limit"], ParamsOfBody<Q["body"], DB, Outer, C2, M>>
				>
			: M // type-mutate: equivalent never-false – a WITH clause with an error: the main pass rejects the statement
		: never;
/** `LIMIT NULL` / `OFFSET NULL` mean no limit / no offset. */
type ParamsOfLimit<E extends Expr | null, M> = E extends {
	readonly t: "param";
	readonly n: infer N extends number;
}
	? AddParam<M, N, Info<"int4", true>>
	: E extends {
				readonly t: "cast";
				readonly to: infer T;
				readonly e: { readonly t: "param"; readonly n: infer N extends number };
			}
		? AddParam<M, N, Mk<T, true>>
		: M;

type ParamsOfBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M,
> = B extends { readonly t: "setop" }
	? ParamsOfBody<
			B["r"],
			DB,
			Outer,
			Ctes,
			ParamsOfBody<B["l"], DB, Outer, Ctes, M>
		>
	: B extends { readonly t: "paren" }
		? ParamsOfSelect<B["q"], DB, Outer, Ctes, M>
		: B extends { readonly t: "values" }
			? ParamsOfRows<B["rows"], MkCtx<DB, Outer, Ctes, false>, M> // type-mutate: equivalent bool-flip – VALUES has no aggregates
			: B extends { readonly t: "simple" }
				? BindFrom<B["from"], DB, Outer, Ctes> extends infer L
					? L extends ScopeLevel
						? ParamsOfSimple<
								Extract<B, SimpleSelect>,
								MkCtx<
									DB,
									[L, ...Outer],
									Ctes,
									B["groupBy"] extends null ? false : true // type-mutate: equivalent never-true – read with extends false, never counts as not grouped
								>,
								M
							>
						: ParamsOfSimple<
								// type-mutate: equivalent never-false – a FROM clause with an error: the main pass rejects the statement
								Extract<B, SimpleSelect>,
								MkCtx<DB, Outer, Ctes, false>, // type-mutate: equivalent bool-flip – a FROM clause with an error: the main pass rejects the statement
								M
							>
					: never
				: M; // type-mutate: equivalent never-false – every body is one of these
type ParamsOfRows<
	Rows extends readonly (readonly Expr[])[],
	C extends Ctx,
	M,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? ParamsOfRows<Rest, C, ParamsOfList<R, C, M, null>>
	: M;
type ParamsOfSimple<B extends SimpleSelect, C extends Ctx, M> = B extends {
	readonly targets: infer Ts extends readonly Target[];
	readonly from: infer Fs extends readonly FromItem[];
	readonly where: infer W extends Expr | null;
	readonly having: infer H extends Expr | null;
	readonly groupBy: infer G;
}
	? ParamsOfOpt<
			H,
			C,
			ParamsOfList<
				G extends readonly Expr[] ? G : [],
				C,
				ParamsOfOpt<
					W,
					C,
					ParamsOfTargets<Ts, C, ParamsOfFromItems<Fs, C, M>>,
					Info<"bool">
				>,
				null
			>,
			Info<"bool">
		>
	: M; // type-mutate: equivalent never-false – every simple SELECT has these fields
