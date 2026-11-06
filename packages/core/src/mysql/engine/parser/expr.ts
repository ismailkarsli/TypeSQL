import type { NameOf } from "../../../engine/family/lex.js";
import type {
	CloseOk,
	Expect,
	IsOp,
	IsWord,
	Name,
	Negate,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { GE } from "../../../engine/num.js";
import type { Ok, Toks } from "../../../engine/tokens.js";
import type { Expr, SelectStmt, WindowSpec } from "../ast.js";
import type { NoCall } from "./keywords.js";
import type { ParseSubquery } from "./select.js";
import type { ParseCastType } from "./typename.js";
import type { Ident } from "./util.js";

/** MySQL's operator precedence, loosest first. */
type Prec = {
	readonly assign: 1;
	readonly or: 2;
	readonly xor: 3;
	readonly and: 4;
	readonly not: 5;
	readonly cmp: 7;
	readonly bitor: 8;
	readonly bitand: 9;
	readonly shift: 10;
	readonly add: 11;
	readonly mul: 12;
	readonly bitxor: 13;
	readonly unary: 14;
	readonly bang: 15;
	readonly collate: 16;
};

export type ParseExpr<T extends Toks, I extends number> = ParseExprPrec<
	T,
	I,
	0
>;

/** An expression that may not be an assignment (`=` compares). */
type ParseExprPrec<T extends Toks, I extends number, Min extends number> =
	ParsePrefix<T, I, Min> extends Ok<
		infer E extends Expr,
		infer J extends number
	>
		? ParseInfix<T, J, E, Min>
		: ParsePrefix<T, I, Min>;

type ParsePrefix<
	T extends Toks,
	I extends number,
	Min extends number,
> = T[I] extends {
	readonly k: "o";
	readonly v: infer O;
}
	? O extends "-" | "+" | "~"
		? ParseExprPrec<T, Next<I>, Prec["unary"]> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? Ok<Unary<O, E>, J>
			: ParseExprPrec<T, Next<I>, Prec["unary"]>
		: O extends "!"
			? ParseExprPrec<T, Next<I>, Prec["bang"]> extends Ok<
					infer E extends Expr,
					infer J extends number
				>
				? Ok<{ t: "un"; op: "not"; e: E }, J>
				: ParseExprPrec<T, Next<I>, Prec["bang"]>
			: O extends "("
				? ParseParen<T, Next<I>>
				: SyntaxErr<T, I>
	: T[I] extends { readonly k: "w"; readonly v: infer W }
		? W extends "not"
			? GE<Prec["not"], Min> extends false
				? SyntaxErr<T, I>
				: ParseExprPrec<T, Next<I>, Prec["not"]> extends Ok<
							infer E extends Expr,
							infer J extends number
						>
					? Ok<{ t: "un"; op: "not"; e: E }, J>
					: ParseExprPrec<T, Next<I>, Prec["not"]>
			: W extends "binary"
				? ParseExprPrec<T, Next<I>, Prec["collate"]> extends Ok<
						infer E extends Expr,
						infer J extends number
					>
					? Ok<{ t: "un"; op: "binary"; e: E }, J>
					: ParseExprPrec<T, Next<I>, Prec["collate"]>
				: W extends "interval"
					? IsOp<T, Next<I>, "("> extends true
						? ParsePrimary<T, I>
						: ParseInterval<T, Next<I>>
					: ParsePrimary<T, I>
		: ParsePrimary<T, I>;

type Unary<O, E extends Expr> = O extends "-"
	? Negate<E>
	: O extends "+"
		? E
		: { t: "un"; op: O; e: E };

type IntervalUnit =
	| "microsecond"
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "year"
	| "second_microsecond"
	| "minute_microsecond"
	| "minute_second"
	| "hour_microsecond"
	| "hour_second"
	| "hour_minute"
	| "day_microsecond"
	| "day_second"
	| "day_minute"
	| "day_hour"
	| "year_month";

type ParseInterval<T extends Toks, I extends number> =
	ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? T[J] extends {
				readonly k: "w";
				readonly v: infer U extends IntervalUnit;
			}
			? Ok<{ t: "interval"; e: E; unit: U }, Next<J>>
			: SyntaxErr<T, J>
		: ParseExpr<T, I>;

type ParseParen<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: "select" | "with" | "values" | "table";
}
	? ParenSub<T, I>
	: IsOp<T, I, "("> extends true
		? IsSubqueryParen<T, I> extends true
			? ParenSub<T, I>
			: ParseParenList<T, I>
		: ParseParenList<T, I>;
/** A query at `I`, then its closing parenthesis. */
type ParenSub<T extends Toks, I extends number> =
	ParseSubquery<T, I> extends Ok<
		infer Q extends SelectStmt,
		infer J extends number
	>
		? CloseOk<T, J, { t: "sub"; q: Q }>
		: ParseSubquery<T, I>;
type ParseParenList<T extends Toks, I extends number> =
	ParseExprList<T, I, []> extends Ok<
		infer L extends readonly Expr[],
		infer J extends number
	>
		? CloseOk<
				T,
				J,
				L extends readonly [infer One extends Expr]
					? One
					: { t: "row"; items: L }
			>
		: ParseExprList<T, I, []>;

/** `((SELECT …))`: parentheses that hold a query. */
export type IsSubqueryParen<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? IsSubqueryParen<T, Next<I>>
		: IsWord<T, I, "select" | "with" | "values" | "table">;

export type ParseExprList<
	T extends Toks,
	I extends number,
	Acc extends readonly Expr[],
> =
	ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? IsOp<T, J, ","> extends true
			? ParseExprList<T, Next<J>, [...Acc, E]>
			: Ok<[...Acc, E], J>
		: ParseExpr<T, I>;

type ParsePrimary<T extends Toks, I extends number> = T[I] extends {
	readonly k: "n";
	readonly v: infer V extends string;
}
	? Ok<{ t: "num"; v: V }, Next<I>>
	: T[I] extends { readonly k: "s"; readonly v: infer V extends string }
		? T[I] extends { readonly blob: true }
			? Ok<{ t: "blob"; v: V }, Next<I>>
			: T[I] extends { readonly f: infer F extends string }
				? Ok<{ t: "str"; v: V; f: F }, Next<I>>
				: Ok<{ t: "str"; v: V; f: V }, Next<I>>
		: T[I] extends { readonly k: "$"; readonly v: infer N extends number }
			? Ok<{ t: "param"; n: N }, Next<I>>
			: T[I] extends { readonly k: "v"; readonly v: infer V extends string }
				? IsOp<T, Next<I>, ":="> extends true
					? ParseExprPrec<T, Next<Next<I>>, Prec["assign"]> extends Ok<
							infer E extends Expr,
							infer J extends number
						>
						? Ok<{ t: "assign"; name: V; e: E }, J>
						: ParseExprPrec<T, Next<Next<I>>, Prec["assign"]>
					: Ok<{ t: "var"; name: V }, Next<I>>
				: T[I] extends { readonly k: "w"; readonly v: infer W extends string }
					? ParseWordPrimary<T, I, W>
					: T[I] extends { readonly k: "id" }
						? ParseColumnRef<T, I>
						: SyntaxErr<T, I>;

type CTime =
	| "current_date"
	| "current_time"
	| "current_timestamp"
	| "localtime"
	| "localtimestamp"
	| "utc_date"
	| "utc_time"
	| "utc_timestamp"
	| "current_user";

type ParseWordPrimary<
	T extends Toks,
	I extends number,
	W extends string,
> = W extends "null"
	? Ok<{ t: "null" }, Next<I>>
	: W extends "true" | "false"
		? Ok<{ t: "bool"; v: W extends "true" ? true : false }, Next<I>>
		: W extends CTime
			? IsOp<T, Next<I>, "("> extends true
				? CTimeArgs<T, Next<Next<I>>> extends infer J extends number
					? Ok<{ t: "ctime"; fn: W }, J>
					: CTimeArgs<T, Next<Next<I>>>
				: Ok<{ t: "ctime"; fn: W }, Next<I>>
			: W extends "date" | "time" | "timestamp"
				? T[Next<I>] extends {
						readonly k: "s";
						readonly v: infer V extends string;
					}
					? Ok<
							{
								t: "cast";
								e: { t: "str"; v: V };
								to: W extends "timestamp" ? "datetime" : W;
								lit: true;
							},
							Next<Next<I>>
						>
					: AfterWord<T, I, W>
				: W extends `_${string}`
					? T[Next<I>] extends {
							readonly k: "s";
							readonly v: infer V extends string;
						}
						? W extends "_binary"
							? Ok<{ t: "blob"; v: V }, Next<Next<I>>>
							: Ok<{ t: "str"; v: V }, Next<Next<I>>>
						: AfterWord<T, I, W>
					: W extends "cast"
						? ParseCast<T, Next<I>>
						: W extends "convert"
							? ParseConvert<T, Next<I>>
							: W extends "case"
								? ParseCase<T, Next<I>>
								: W extends "exists"
									? ParseExists<T, Next<I>>
									: W extends "match"
										? ParseMatch<T, Next<I>>
										: W extends "row"
											? IsOp<T, Next<I>, "("> extends true
												? ParseExprList<T, Next<Next<I>>, []> extends Ok<
														infer L extends readonly Expr[],
														infer J extends number
													>
													? CloseOk<T, J, { t: "row"; items: L }>
													: ParseExprList<T, Next<Next<I>>, []>
												: AfterWord<T, I, W>
											: W extends "default"
												? IsOp<T, Next<I>, "("> extends true
													? ParseCall<T, I, ["default", NameOf<T[I]> & string]>
													: Ok<{ t: "default" }, Next<I>>
												: AfterWord<T, I, W>;

/** After `CURRENT_TIMESTAMP(`: `)` or a precision then `)`. */
type CTimeArgs<T extends Toks, I extends number> =
	IsOp<T, I, ")"> extends true
		? Next<I>
		: T[I] extends { readonly k: "n" }
			? Expect<T, Next<I>, ")">
			: SyntaxErr<T, I>;

type AfterWord<T extends Toks, I extends number, W extends string> =
	IsOp<T, Next<I>, "("> extends true
		? W extends NoCall
			? SyntaxErr<T, I>
			: ParseCall<T, I, [W, NameOf<T[I]> & string]>
		: ParseColumnRef<T, I>;

type ParseExists<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseSubquery<T, J> extends Ok<
				infer Q extends SelectStmt,
				infer J2 extends number
			>
			? CloseOk<T, J2, { t: "exists"; q: Q }>
			: ParseSubquery<T, J>
		: Expect<T, I, "(">;

/** `MATCH (col, …) AGAINST (expr [modifier])`. */
type ParseMatch<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExprList<T, J, []> extends Ok<
				infer Cols extends readonly Expr[],
				infer J2 extends number
			>
			? Expect<T, J2, ")"> extends infer J3 extends number
				? IsWord<T, J3, "against"> extends true
					? Expect<T, Next<J3>, "("> extends infer J4 extends number
						? ParseExprPrec<T, J4, Prec["bitor"]> extends Ok<
								infer Ag extends Expr,
								infer J5 extends number
							>
							? SkipToClose<T, J5> extends infer J6 extends number
								? Ok<{ t: "match"; cols: Cols; against: Ag }, J6>
								: SkipToClose<T, J5>
							: ParseExprPrec<T, J4, Prec["bitor"]>
						: Expect<T, Next<J3>, "(">
					: SyntaxErr<T, J3>
				: Expect<T, J2, ")">
			: ParseExprList<T, J, []>
		: Expect<T, I, "(">;
type SkipToClose<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: ")";
}
	? Next<I>
	: T[I] extends { readonly k: "w" }
		? SkipToClose<T, Next<I>>
		: SyntaxErr<T, I>;

type ParseColumnRef<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Next<I>, "."> extends true
			? Ident<T, Next<Next<I>>> extends infer B extends Name
				? IsOp<T, Next<Next<Next<I>>>, "."> extends true
					? Ident<T, Next<Next<Next<Next<I>>>>> extends infer C extends Name
						? IsOp<T, Next<Next<Next<Next<Next<I>>>>>, "("> extends true
							? SyntaxErr<T, Next<Next<Next<Next<Next<I>>>>>>
							: Ok<
									{
										t: "col";
										schema: A["v"];
										tbl: B["v"];
										name: C["v"];
										n: C["n"];
										disp: `${A["n"]}.${B["n"]}.${C["n"]}`;
									},
									Next<Next<Next<Next<Next<I>>>>>
								>
						: SyntaxErr<T, Next<Next<Next<Next<I>>>>>
					: IsOp<T, Next<Next<Next<I>>>, "("> extends true
						? ParseCall<
								T,
								Next<Next<I>>,
								[`${A["v"]}.${B["v"]}`, `${A["n"]}.${B["n"]}`]
							>
						: Ok<
								{
									t: "col";
									schema: null;
									tbl: A["v"];
									name: B["v"];
									n: B["n"];
									disp: `${A["n"]}.${B["n"]}`;
								},
								Next<Next<Next<I>>>
							>
				: SyntaxErr<T, Next<Next<I>>>
			: Ok<
					{
						t: "col";
						schema: null;
						tbl: null;
						name: A["v"];
						n: A["n"];
						disp: A["n"];
					},
					Next<I>
				>
		: SyntaxErr<T, I>;

type ParseCast<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExpr<T, J> extends Ok<infer E extends Expr, infer J2 extends number>
			? IsWord<T, J2, "as"> extends true
				? ParseCastType<T, Next<J2>> extends Ok<
						infer Ty extends string,
						infer J3 extends number
					>
					? IsWord<T, J3, "array"> extends true
						? CloseOk<T, Next<J3>, { t: "cast"; e: E; to: "json" }>
						: CloseOk<T, J3, { t: "cast"; e: E; to: Ty }>
					: ParseCastType<T, Next<J2>>
				: SyntaxErr<T, J2>
			: ParseExpr<T, J>
		: Expect<T, I, "(">;

/** `CONVERT(expr, type)` and `CONVERT(expr USING charset)`. */
type ParseConvert<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExpr<T, J> extends Ok<infer E extends Expr, infer J2 extends number>
			? IsOp<T, J2, ","> extends true
				? ParseCastType<T, Next<J2>> extends Ok<
						infer Ty extends string,
						infer J3 extends number
					>
					? CloseOk<T, J3, { t: "cast"; e: E; to: Ty }>
					: ParseCastType<T, Next<J2>>
				: IsWord<T, J2, "using"> extends true
					? T[Next<Next<J2>>] extends { readonly k: "o"; readonly v: ")" }
						? Ok<
								{
									t: "convert";
									e: E;
									binary: IsWord<T, Next<J2>, "binary">;
								},
								Next<Next<Next<J2>>>
							>
						: SyntaxErr<T, Next<Next<J2>>>
					: SyntaxErr<T, J2>
			: ParseExpr<T, J>
		: Expect<T, I, "(">;

type ParseCase<T extends Toks, I extends number> =
	IsWord<T, I, "when"> extends true
		? ParseWhens<T, I, null, []>
		: ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
			? IsWord<T, J, "when"> extends true
				? ParseWhens<T, J, E, []>
				: SyntaxErr<T, J>
			: ParseExpr<T, I>;
type ParseWhens<
	T extends Toks,
	I extends number,
	Operand,
	Acc extends readonly unknown[],
> =
	IsWord<T, I, "when"> extends true
		? ParseExpr<T, Next<I>> extends Ok<
				infer C extends Expr,
				infer J extends number
			>
			? IsWord<T, J, "then"> extends true
				? ParseExpr<T, Next<J>> extends Ok<
						infer V extends Expr,
						infer J2 extends number
					>
					? ParseWhens<T, J2, Operand, [...Acc, { when: C; then: V }]>
					: ParseExpr<T, Next<J>>
				: SyntaxErr<T, J>
			: ParseExpr<T, Next<I>>
		: Acc extends readonly []
			? SyntaxErr<T, I>
			: IsWord<T, I, "else"> extends true
				? ParseExpr<T, Next<I>> extends Ok<
						infer E extends Expr,
						infer J extends number
					>
					? IsWord<T, J, "end"> extends true
						? Ok<{ t: "case"; operand: Operand; whens: Acc; else: E }, Next<J>>
						: SyntaxErr<T, J>
					: ParseExpr<T, Next<I>>
				: IsWord<T, I, "end"> extends true
					? Ok<{ t: "case"; operand: Operand; whens: Acc; else: null }, Next<I>>
					: SyntaxErr<T, I>;

/** Functions whose first argument is a unit or keyword, not an expression. */
type UnitFirst = "timestampadd" | "timestampdiff" | "get_format";

type ParseCall<T extends Toks, I extends number, Name> = Name extends readonly [
	infer N extends string,
	unknown,
]
	? N extends "trim"
		? ParseTrim<T, Next<Next<I>>, Name>
		: N extends "substring" | "substr" | "mid"
			? ParseSubstring<T, Next<Next<I>>, Name>
			: N extends "position"
				? ParsePosition<T, Next<Next<I>>, Name>
				: N extends "extract"
					? ParseExtract<T, Next<Next<I>>, Name>
					: N extends UnitFirst
						? T[Next<Next<I>>] extends { readonly k: "w" | "s" }
							? IsOp<T, Next<Next<Next<I>>>, ","> extends true
								? CallArgs<
										T,
										Next<Next<Next<Next<I>>>>,
										Name,
										false,
										[{ t: "str"; v: "unit" }]
									>
								: SyntaxErr<T, Next<Next<Next<I>>>>
							: SyntaxErr<T, Next<Next<I>>>
						: IsOp<T, Next<Next<I>>, ")"> extends true
							? CallTail<T, Next<Next<Next<I>>>, Name, [], false, false, []>
							: IsOp<T, Next<Next<I>>, "*"> extends true
								? Expect<T, Next<Next<Next<I>>>, ")"> extends infer J extends
										number
									? CallTail<T, J, Name, [], true, false, []>
									: Expect<T, Next<Next<Next<I>>>, ")">
								: CallArgs<
										T,
										IsWord<
											T,
											Next<Next<I>>,
											"distinct" | "distinctrow" | "all"
										> extends true
											? Next<Next<Next<I>>>
											: Next<Next<I>>,
										Name,
										IsWord<T, Next<Next<I>>, "distinct" | "distinctrow">,
										[]
									>
	: never;

type CallArgs<
	T extends Toks,
	I extends number,
	Name,
	Distinct extends boolean,
	Pre extends readonly Expr[],
> =
	ParseExprList<T, I, Pre> extends Ok<
		infer Args extends readonly Expr[],
		infer J extends number
	>
		? CallOrder<T, J> extends Ok<
				infer Ord extends readonly Expr[],
				infer J2 extends number
			>
			? SkipCallSuffix<T, J2> extends infer J3 extends number
				? Expect<T, J3, ")"> extends infer J4 extends number
					? CallTail<T, J4, Name, Args, false, Distinct, Ord>
					: Expect<T, J3, ")">
				: SkipCallSuffix<T, J2>
			: CallOrder<T, J>
		: ParseExprList<T, I, Pre>;
/** An optional `ORDER BY` inside a call's parentheses (GROUP_CONCAT). */
type CallOrder<T extends Toks, I extends number> =
	IsWord<T, I, "order"> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? ParseOrderList<T, Next<Next<I>>, []>
			: SyntaxErr<T, Next<I>>
		: Ok<[], I>;

/**
 * `SEPARATOR 'x'` (GROUP_CONCAT), `USING charset` (CHAR), `RETURNING type`
 * and `… ON EMPTY` / `… ON ERROR` (JSON_VALUE), `AS CHAR(n)` (WEIGHT_STRING).
 */
type SkipCallSuffix<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "separator"
		? T[Next<I>] extends { readonly k: "s" }
			? SkipCallSuffix<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: W extends "using"
			? T[Next<I>] extends { readonly k: "w" | "id" }
				? SkipCallSuffix<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
			: W extends "returning" | "as"
				? ParseCastType<T, Next<I>> extends Ok<unknown, infer J extends number>
					? SkipCallSuffix<T, J>
					: ParseCastType<T, Next<I>>
				: W extends "null" | "error" | "default" | "on" | "empty"
					? SkipJsonHandler<T, I>
					: I
	: I;
type SkipJsonHandler<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: ")";
}
	? I
	: T[I] extends { readonly k: string }
		? T[I] extends { readonly k: "o"; readonly v: "(" }
			? SyntaxErr<T, I>
			: SkipJsonHandler<T, Next<I>>
		: SyntaxErr<T, I>;

/** `TRIM([[BOTH | LEADING | TRAILING] [remstr] FROM] str)`. */
type ParseTrim<T extends Toks, I extends number, Name> = (
	IsWord<T, I, "both" | "leading" | "trailing"> extends true
		? Next<I>
		: I
) extends infer J extends number
	? IsWord<T, J, "from"> extends true
		? ParseExpr<T, Next<J>> extends Ok<
				infer S extends Expr,
				infer J2 extends number
			>
			? Expect<T, J2, ")"> extends infer J3 extends number
				? CallTail<T, J3, Name, [S], false, false, []>
				: Expect<T, J2, ")">
			: ParseExpr<T, Next<J>>
		: ParseExpr<T, J> extends Ok<infer A extends Expr, infer J2 extends number>
			? IsWord<T, J2, "from"> extends true
				? ParseExpr<T, Next<J2>> extends Ok<
						infer S extends Expr,
						infer J3 extends number
					>
					? Expect<T, J3, ")"> extends infer J4 extends number
						? CallTail<T, J4, Name, [S, A], false, false, []>
						: Expect<T, J3, ")">
					: ParseExpr<T, Next<J2>>
				: J extends I
					? IsOp<T, J2, ","> extends true
						? CallArgs<T, Next<J2>, Name, false, [A]>
						: Expect<T, J2, ")"> extends infer J4 extends number
							? CallTail<T, J4, Name, [A], false, false, []>
							: Expect<T, J2, ")">
					: SyntaxErr<T, J2>
			: ParseExpr<T, J>
	: never;

/** `SUBSTRING(str FROM pos [FOR len])` or `SUBSTRING(str, pos[, len])`. */
type ParseSubstring<T extends Toks, I extends number, Name> =
	ParseExpr<T, I> extends Ok<infer S extends Expr, infer J extends number>
		? IsWord<T, J, "from"> extends true
			? ParseExpr<T, Next<J>> extends Ok<
					infer P extends Expr,
					infer J2 extends number
				>
				? IsWord<T, J2, "for"> extends true
					? ParseExpr<T, Next<J2>> extends Ok<
							infer L extends Expr,
							infer J3 extends number
						>
						? Expect<T, J3, ")"> extends infer J4 extends number
							? CallTail<T, J4, Name, [S, P, L], false, false, []>
							: Expect<T, J3, ")">
						: ParseExpr<T, Next<J2>>
					: Expect<T, J2, ")"> extends infer J4 extends number
						? CallTail<T, J4, Name, [S, P], false, false, []>
						: Expect<T, J2, ")">
				: ParseExpr<T, Next<J>>
			: IsOp<T, J, ","> extends true
				? CallArgs<T, Next<J>, Name, false, [S]>
				: Expect<T, J, ")"> extends infer J4 extends number
					? CallTail<T, J4, Name, [S], false, false, []>
					: Expect<T, J, ")">
		: ParseExpr<T, I>;

/** `POSITION(substr IN str)`. */
type ParsePosition<T extends Toks, I extends number, Name> =
	ParseExprPrec<T, I, Prec["bitor"]> extends Ok<
		infer A extends Expr,
		infer J extends number
	>
		? IsWord<T, J, "in"> extends true
			? ParseExpr<T, Next<J>> extends Ok<
					infer B extends Expr,
					infer J2 extends number
				>
				? Expect<T, J2, ")"> extends infer J3 extends number
					? CallTail<T, J3, Name, [A, B], false, false, []>
					: Expect<T, J2, ")">
				: ParseExpr<T, Next<J>>
			: SyntaxErr<T, J>
		: ParseExprPrec<T, I, Prec["bitor"]>;

/** `EXTRACT(unit FROM date)`. */
type ParseExtract<T extends Toks, I extends number, Name> = T[I] extends {
	readonly k: "w";
	readonly v: infer U extends IntervalUnit;
}
	? IsWord<T, Next<I>, "from"> extends true
		? ParseExpr<T, Next<Next<I>>> extends Ok<
				infer D extends Expr,
				infer J extends number
			>
			? Expect<T, J, ")"> extends infer J2 extends number
				? CallTail<T, J2, Name, [{ t: "str"; v: U }, D], false, false, []>
				: Expect<T, J, ")">
			: ParseExpr<T, Next<Next<I>>>
		: SyntaxErr<T, Next<I>>
	: SyntaxErr<T, I>;

type CallTail<
	T extends Toks,
	I extends number,
	Name,
	Args extends readonly Expr[],
	Star extends boolean,
	Distinct extends boolean,
	Ord extends readonly Expr[],
> =
	SkipNullTreatment<T, SkipFromFirstLast<T, I>> extends infer I2 extends number
		? IsWord<T, I2, "over"> extends true
			? ParseOver<T, Next<I2>> extends Ok<
					infer Spec extends WindowSpec,
					infer J extends number
				>
				? Ok<MkCall<Name, Args, Star, Distinct, Ord, Spec>, J>
				: ParseOver<T, Next<I2>>
			: Ok<MkCall<Name, Args, Star, Distinct, Ord, null>, I2>
		: never;
/** `FROM FIRST` / `FROM LAST` (NTH_VALUE). */
type SkipFromFirstLast<T extends Toks, I extends number> =
	IsWord<T, I, "from"> extends true
		? IsWord<T, Next<I>, "first" | "last"> extends true
			? Next<Next<I>>
			: I
		: I;
/** `RESPECT NULLS` / `IGNORE NULLS`. */
type SkipNullTreatment<T extends Toks, I extends number> =
	IsWord<T, I, "respect" | "ignore"> extends true
		? IsWord<T, Next<I>, "nulls"> extends true
			? Next<Next<I>>
			: I
		: I;
type MkCall<Name, Args, Star, Distinct, Ord, Over> = {
	t: "call";
	name: Name extends readonly [infer N, unknown] ? N : never;
	disp: Name extends readonly [unknown, infer D] ? D : never;
	args: Args;
	star: Star;
	distinct: Distinct;
	order: Ord;
	over: Over;
};

type ParseOver<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? Ok<{ name: N["v"]; partition: []; order: [] }, Next<I>>
		: IsOp<T, I, "("> extends true
			? ParseWindowSpec<T, Next<I>>
			: SyntaxErr<T, I>;

export type ParseWindowSpec<T extends Toks, I extends number> = (
	Ident<T, I> extends infer N extends Name
		? IsWord<
				T,
				I,
				"partition" | "order" | "rows" | "range" | "groups"
			> extends true
			? [null, I]
			: [N["v"], Next<I>]
		: [null, I]
) extends [infer Base, infer I1 extends number]
	? OptBy<T, I1, "partition"> extends Ok<
			infer Part extends readonly Expr[],
			infer I2 extends number
		>
		? OptBy<T, I2, "order"> extends Ok<
				infer Ord extends readonly Expr[],
				infer I3 extends number
			>
			? SkipFrame<T, I3, []> extends infer J extends number
				? Ok<{ name: Base; partition: Part; order: Ord }, J>
				: SkipFrame<T, I3, []>
			: OptBy<T, I2, "order">
		: OptBy<T, I1, "partition">
	: never;

/** `PARTITION BY list` / `ORDER BY list`, or `Absent` when the word is not at `I`. */
type OptBy<
	T extends Toks,
	I extends number,
	W extends "order" | "partition",
	Absent = [],
> =
	IsWord<T, I, W> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? W extends "order"
				? ParseOrderList<T, Next<Next<I>>, []>
				: ParseExprList<T, Next<Next<I>>, []>
			: SyntaxErr<T, Next<I>>
		: Ok<Absent, I>;

type SkipFrame<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[],
> = T[I] extends { readonly k: "o"; readonly v: "(" }
	? SkipFrame<T, Next<I>, [...Depth, 0]>
	: T[I] extends { readonly k: "o"; readonly v: ")" }
		? Depth extends readonly [unknown, ...infer D]
			? SkipFrame<T, Next<I>, D>
			: Next<I>
		: T[I] extends { readonly k: string }
			? SkipFrame<T, Next<I>, Depth>
			: SyntaxErr<T, I>;

export type ParseOrderList<
	T extends Toks,
	I extends number,
	Acc extends readonly Expr[],
> =
	ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? (
				IsWord<T, J, "asc" | "desc"> extends true
					? Next<J>
					: J
			) extends infer J2 extends number
			? IsOp<T, J2, ","> extends true
				? ParseOrderList<T, Next<J2>, [...Acc, E]>
				: Ok<[...Acc, E], J2>
			: never
		: ParseExpr<T, I>;

type ParseInfix<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
> = T[I] extends { readonly k: "o"; readonly v: infer O extends string }
	? InfixOp<T, I, L, Min, O>
	: T[I] extends { readonly k: "w"; readonly v: infer W extends string }
		? InfixWord<T, I, L, Min, W>
		: Ok<L, I>;

type BinPrec<O extends string> = O extends "->" | "->>"
	? Prec["collate"]
	: O extends "^"
		? Prec["bitxor"]
		: O extends "*" | "/" | "%"
			? Prec["mul"]
			: O extends "+" | "-"
				? Prec["add"]
				: O extends "<<" | ">>"
					? Prec["shift"]
					: O extends "&"
						? Prec["bitand"]
						: O extends "|"
							? Prec["bitor"]
							: O extends "=" | "<=>" | "!=" | "<>" | "<" | ">" | "<=" | ">="
								? Prec["cmp"]
								: O extends "&&"
									? Prec["and"]
									: O extends "||"
										? Prec["or"]
										: null;

type BinOp<O extends string> = O extends "<>"
	? "!="
	: O extends "&&"
		? "and"
		: O extends "||"
			? "or"
			: O;

type InfixOp<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	O extends string,
> =
	BinPrec<O> extends infer P extends number
		? GE<P, Min> extends true
			? P extends Prec["cmp"]
				? T[Next<I>] extends {
						readonly k: "w";
						readonly v: infer Q extends "any" | "some" | "all";
					}
					? IsOp<T, Next<Next<I>>, "("> extends true
						? ParseQuantified<T, Next<Next<Next<I>>>, L, Min, O, Q>
						: InfixRight<T, I, L, Min, O, P>
					: InfixRight<T, I, L, Min, O, P>
				: InfixRight<T, I, L, Min, O, P>
			: Ok<L, I>
		: Ok<L, I>;

type InfixRight<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	O extends string,
	P extends number,
> =
	ParseExprPrec<T, Next<I>, Next<P>> extends Ok<
		infer E extends Expr,
		infer J extends number
	>
		? ParseInfix<T, J, { t: "bin"; op: BinOp<O>; l: L; r: E }, Min>
		: ParseExprPrec<T, Next<I>, Next<P>>;

/** `x = ANY (SELECT …)`, `x > ALL (SELECT …)`. */
type ParseQuantified<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	O extends string,
	Q extends string,
> =
	ParseSubquery<T, I> extends Ok<
		infer S extends SelectStmt,
		infer J extends number
	>
		? Expect<T, J, ")"> extends infer J2 extends number
			? ParseInfix<
					T,
					J2,
					{
						t: "quant";
						l: L;
						op: BinOp<O>;
						q: Q extends "all" ? "all" : "any";
						r: S;
					},
					Min
				>
			: Expect<T, J, ")">
		: ParseSubquery<T, I>;

type LikeOp = "like" | "regexp" | "rlike";

type InfixWord<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
> = W extends "or" | "and" | "xor"
	? GE<Prec[W], Min> extends true
		? ParseExprPrec<T, Next<I>, Next<Prec[W]>> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? ParseInfix<T, J, { t: "bin"; op: W; l: L; r: E }, Min>
			: ParseExprPrec<T, Next<I>, Next<Prec[W]>>
		: Ok<L, I>
	: W extends "div" | "mod"
		? GE<Prec["mul"], Min> extends true
			? ParseExprPrec<T, Next<I>, Next<Prec["mul"]>> extends Ok<
					infer E extends Expr,
					infer J extends number
				>
				? ParseInfix<
						T,
						J,
						{ t: "bin"; op: W extends "mod" ? "%" : "div"; l: L; r: E },
						Min
					>
				: ParseExprPrec<T, Next<I>, Next<Prec["mul"]>>
			: Ok<L, I>
		: W extends "collate"
			? GE<Prec["collate"], Min> extends true
				? T[Next<I>] extends { readonly k: "w" | "id" | "s" }
					? ParseInfix<T, Next<Next<I>>, { t: "collate"; e: L }, Min>
					: SyntaxErr<T, Next<I>>
				: Ok<L, I>
			: GE<Prec["cmp"], Min> extends true
				? W extends "is"
					? ParseIs<T, Next<I>, L, Min>
					: W extends "not"
						? T[Next<I>] extends {
								readonly k: "w";
								readonly v: infer W2 extends string;
							}
							? W2 extends "in" | "between" | LikeOp
								? ParsePredicate<T, Next<Next<I>>, L, Min, W2, true>
								: Ok<L, I>
							: Ok<L, I>
						: W extends "in" | "between" | LikeOp
							? ParsePredicate<T, Next<I>, L, Min, W, false>
							: W extends "sounds"
								? IsWord<T, Next<I>, "like"> extends true
									? ParseExprPrec<
											T,
											Next<Next<I>>,
											Next<Prec["cmp"]>
										> extends Ok<infer E extends Expr, infer J extends number>
										? ParseInfix<
												T,
												J,
												{ t: "bin"; op: "sounds"; l: L; r: E },
												Min
											>
										: ParseExprPrec<T, Next<Next<I>>, Next<Prec["cmp"]>>
									: Ok<L, I>
								: W extends "member"
									? IsWord<T, Next<I>, "of"> extends true
										? ParseMemberOf<T, Next<Next<I>>, L, Min>
										: Ok<L, I>
									: Ok<L, I>
				: Ok<L, I>;

/** After `MEMBER OF`: `(doc)`. */
type ParseMemberOf<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExpr<T, J> extends Ok<infer E extends Expr, infer J2 extends number>
			? Expect<T, J2, ")"> extends infer J3 extends number
				? ParseInfix<T, J3, { t: "member"; e: L; doc: E }, Min>
				: Expect<T, J2, ")">
			: ParseExpr<T, J>
		: Expect<T, I, "(">;

type ParseIs<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
> = (IsWord<T, I, "not"> extends true ? [true, Next<I>] : [false, I]) extends [
	infer Not extends boolean,
	infer J extends number,
]
	? T[J] extends {
			readonly k: "w";
			readonly v: infer W extends "null" | "true" | "false" | "unknown";
		}
		? ParseInfix<
				T,
				Next<J>,
				{ t: "is"; e: L; what: W extends "unknown" ? "null" : W; not: Not },
				Min
			>
		: SyntaxErr<T, J>
	: never;

type ParsePredicate<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
	Not extends boolean,
> = W extends "between"
	? ParseExprPrec<T, I, Prec["bitor"]> extends Ok<
			infer LoE extends Expr,
			infer J extends number
		>
		? IsWord<T, J, "and"> extends true
			? ParseExprPrec<T, Next<J>, Prec["bitor"]> extends Ok<
					infer HiE extends Expr,
					infer J2 extends number
				>
				? ParseInfix<
						T,
						J2,
						{ t: "between"; e: L; lo: LoE; hi: HiE; not: Not },
						Min
					>
				: ParseExprPrec<T, Next<J>, Prec["bitor"]>
			: SyntaxErr<T, J>
		: ParseExprPrec<T, I, Prec["bitor"]>
	: W extends "in"
		? ParseIn<T, I, L, Min, Not>
		: W extends LikeOp
			? ParseExprPrec<T, I, Next<Prec["cmp"]>> extends Ok<
					infer Pat extends Expr,
					infer J extends number
				>
				? IsWord<T, J, "escape"> extends true
					? ParseExprPrec<T, Next<J>, Next<Prec["cmp"]>> extends Ok<
							infer EsE extends Expr,
							infer J2 extends number
						>
						? ParseInfix<
								T,
								J2,
								{ t: "like"; e: L; pat: Pat; esc: EsE; kind: W; not: Not },
								Min
							>
						: ParseExprPrec<T, Next<J>, Next<Prec["cmp"]>>
					: ParseInfix<
							T,
							J,
							{ t: "like"; e: L; pat: Pat; esc: null; kind: W; not: Not },
							Min
						>
				: ParseExprPrec<T, I, Next<Prec["cmp"]>>
			: never;

type ParseIn<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	Not extends boolean,
> =
	IsOp<T, I, "("> extends true
		? IsSubqueryParen<T, Next<I>> extends true
			? ParseSubquery<T, Next<I>> extends Ok<
					infer Q extends SelectStmt,
					infer J extends number
				>
				? Expect<T, J, ")"> extends infer J2 extends number
					? ParseInfix<T, J2, { t: "insub"; e: L; q: Q; not: Not }, Min>
					: Expect<T, J, ")">
				: ParseSubquery<T, Next<I>>
			: ParseExprList<T, Next<I>, []> extends Ok<
						infer List extends readonly Expr[],
						infer J extends number
					>
				? Expect<T, J, ")"> extends infer J2 extends number
					? ParseInfix<T, J2, { t: "in"; e: L; list: List; not: Not }, Min>
					: Expect<T, J, ")">
				: ParseExprList<T, Next<I>, []>
		: SyntaxErr<T, I>;
