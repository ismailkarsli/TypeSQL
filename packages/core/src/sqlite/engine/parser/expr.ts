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
import type { SqlError } from "../../../errors.js";
import type { Expr, SelectStmt, TableRef, WindowSpec } from "../ast.js";
import type { Reserved } from "./keywords.js";
import type { ParenSubquery } from "./select.js";
import type { Ident, TableRefAt } from "./util.js";

type Prec = {
	readonly or: 1;
	readonly and: 2;
	readonly not: 3;
	readonly eq: 4;
	readonly cmp: 5;
	readonly bit: 7;
	readonly add: 8;
	readonly mul: 9;
	readonly cat: 10;
	readonly collate: 11;
	readonly unary: 12;
};

export type ParseExpr<T extends Toks, I extends number> = ParseExprPrec<
	T,
	I,
	0
>;

type ParseExprPrec<T extends Toks, I extends number, Min extends number> =
	ParsePrefix<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? ParseInfix<T, J, E, Min>
		: ParsePrefix<T, I>;

type ParsePrefix<T extends Toks, I extends number> = T[I] extends {
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
		: O extends "("
			? ParseParen<T, Next<I>>
			: SyntaxErr<T, I>
	: T[I] extends { readonly k: "w"; readonly v: "not" }
		? ParseExprPrec<T, Next<I>, Prec["not"]> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? Ok<{ t: "un"; op: "not"; e: E }, J>
			: ParseExprPrec<T, Next<I>, Prec["not"]>
		: ParsePrimary<T, I>;

// Unary plus is no-op the typer would see through everywhere; it stays only on a
// column, which SQLite then names by the expression's text instead of the column's.
type Unary<O, E extends Expr> = O extends "-"
	? Negate<E>
	: O extends "+"
		? E extends { readonly t: "col" }
			? { t: "un"; op: O; e: E }
			: E
		: { t: "un"; op: O; e: E };

type ParseParen<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: "select" | "with" | "values";
}
	? ParenSubquery<T, I> extends Ok<
			infer Q extends SelectStmt,
			infer J extends number
		>
		? Ok<{ t: "sub"; q: Q }, J>
		: ParenSubquery<T, I>
	: ParseExprList<T, I, []> extends Ok<
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
			: Ok<{ t: "str"; v: V }, Next<I>>
		: T[I] extends { readonly k: "$"; readonly v: infer N extends number }
			? Ok<{ t: "param"; n: N }, Next<I>>
			: T[I] extends { readonly k: "w"; readonly v: infer W extends string }
				? ParseWordPrimary<T, I, W>
				: T[I] extends { readonly k: "id" }
					? ParseColumnRef<T, I>
					: SyntaxErr<T, I>;

type ParseWordPrimary<
	T extends Toks,
	I extends number,
	W extends string,
> = W extends "null"
	? Ok<{ t: "null" }, Next<I>>
	: W extends "current_time" | "current_date" | "current_timestamp"
		? Ok<{ t: "ctime"; fn: W }, Next<I>>
		: W extends "cast"
			? ParseCast<T, Next<I>>
			: W extends "case"
				? ParseCase<T, Next<I>>
				: W extends "exists"
					? Expect<T, Next<I>, "("> extends infer J extends number
						? ParenSubquery<T, J> extends Ok<
								infer Q extends SelectStmt,
								infer J2 extends number
							>
							? Ok<{ t: "exists"; q: Q }, J2>
							: ParenSubquery<T, J>
						: Expect<T, Next<I>, "(">
					: W extends "raise"
						? SqlError<"RAISE() may only be used within a trigger-program", I>
						: IsOp<T, Next<I>, "("> extends true
							? W extends Reserved
								? SyntaxErr<T, I>
								: ParseCall<T, I, [W, NameOf<T[I]> & string]>
							: W extends "true" | "false"
								? IsOp<T, Next<I>, "."> extends true
									? ParseColumnRef<T, I>
									: Ok<
											{ t: "bool"; v: W extends "true" ? true : false },
											Next<I>
										>
								: ParseColumnRef<T, I>;

type ParseColumnRef<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Next<I>, "."> extends true
			? Ident<T, Next<Next<I>>> extends infer B extends Name
				? IsOp<T, Next<Next<Next<I>>>, "."> extends true
					? Ident<T, Next<Next<Next<Next<I>>>>> extends infer C extends Name
						? Ok<
								{
									t: "col";
									schema: A["v"];
									tbl: B["v"];
									name: C["v"];
									disp: `${A["n"]}.${B["n"]}.${C["n"]}`;
								},
								Next<Next<Next<Next<Next<I>>>>>
							>
						: SyntaxErr<T, Next<Next<Next<Next<I>>>>>
					: Ok<
							{
								t: "col";
								schema: null;
								tbl: A["v"];
								name: B["v"];
								disp: `${A["n"]}.${B["n"]}`;
							},
							Next<Next<Next<I>>>
						>
				: SyntaxErr<T, Next<Next<I>>>
			: Ok<
					T[I] extends { readonly r: `"${string}` }
						? {
								t: "col";
								schema: null;
								tbl: null;
								name: A["v"];
								disp: A["n"];
								quoted: true;
							}
						: { t: "col"; schema: null; tbl: null; name: A["v"]; disp: A["n"] },
					Next<I>
				>
		: SyntaxErr<T, I>;

export type ParseTypeName<T extends Toks, I extends number> = TypeWords<
	T,
	I,
	""
>;
type TypeWords<
	T extends Toks,
	I extends number,
	Acc extends string,
> = T[I] extends { readonly k: "w" | "id" }
	? T[I] extends { readonly k: "w"; readonly v: TypeStop }
		? TypeArgs<T, I, Acc>
		: NameOf<T[I]> extends infer V extends string
			? TypeWords<T, Next<I>, Acc extends "" ? V : `${Acc} ${V}`>
			: never
	: T[I] extends { readonly k: "s"; readonly v: infer V extends string }
		? TypeWords<T, Next<I>, Acc extends "" ? V : `${Acc} ${V}`>
		: TypeArgs<T, I, Acc>;
type TypeStop =
	| "constraint"
	| "primary"
	| "not"
	| "null"
	| "unique"
	| "check"
	| "default"
	| "collate"
	| "references"
	| "generated"
	| "as";
type TypeArgs<T extends Toks, I extends number, Acc extends string> =
	IsOp<T, I, "("> extends true
		? Acc extends ""
			? SyntaxErr<T, I>
			: TypeArg<T, Next<I>> extends infer J extends number
				? IsOp<T, J, ","> extends true
					? TypeArg<T, Next<J>> extends infer J2 extends number
						? CloseOk<T, J2, Acc>
						: TypeArg<T, Next<J>>
					: CloseOk<T, J, Acc>
				: TypeArg<T, Next<I>>
		: Ok<Acc, I>;
type TypeArg<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: "+" | "-";
}
	? T[Next<I>] extends { readonly k: "n" }
		? Next<Next<I>>
		: SyntaxErr<T, Next<I>>
	: T[I] extends { readonly k: "n" }
		? Next<I>
		: T[I] extends { readonly k: "w" | "id" }
			? Next<I>
			: SyntaxErr<T, I>;

type ParseCast<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExpr<T, J> extends Ok<infer E extends Expr, infer J2 extends number>
			? IsWord<T, J2, "as"> extends true
				? ParseTypeName<T, Next<J2>> extends Ok<
						infer Ty extends string,
						infer J3 extends number
					>
					? CloseOk<T, J3, { t: "cast"; e: E; to: Ty }>
					: ParseTypeName<T, Next<J2>>
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

type ParseCall<T extends Toks, I extends number, Name> =
	IsOp<T, Next<Next<I>>, ")"> extends true
		? CallTail<T, Next<Next<Next<I>>>, Name, [], false, false, []>
		: IsOp<T, Next<Next<I>>, "*"> extends true
			? Expect<T, Next<Next<Next<I>>>, ")"> extends infer J extends number
				? CallTail<T, J, Name, [], true, false, []>
				: Expect<T, Next<Next<Next<I>>>, ")">
			: CallArgs<
					T,
					IsWord<T, Next<Next<I>>, "distinct" | "all"> extends true
						? Next<Next<Next<I>>>
						: Next<Next<I>>,
					Name,
					IsWord<T, Next<Next<I>>, "distinct">
				>;
type CallArgs<
	T extends Toks,
	I extends number,
	Name,
	Distinct extends boolean,
> =
	ParseExprList<T, I, []> extends Ok<
		infer Args extends readonly Expr[],
		infer J extends number
	>
		? IsWord<T, J, "order"> extends true
			? IsWord<T, Next<J>, "by"> extends true
				? ParseOrderList<T, Next<Next<J>>, []> extends Ok<
						infer Ord extends readonly Expr[],
						infer J2 extends number
					>
					? Expect<T, J2, ")"> extends infer J3 extends number
						? CallTail<T, J3, Name, Args, false, Distinct, Ord>
						: Expect<T, J2, ")">
					: ParseOrderList<T, Next<Next<J>>, []>
				: SyntaxErr<T, Next<J>>
			: Expect<T, J, ")"> extends infer J3 extends number
				? CallTail<T, J3, Name, Args, false, Distinct, []>
				: Expect<T, J, ")">
		: ParseExprList<T, I, []>;

type CallTail<
	T extends Toks,
	I extends number,
	Name,
	Args extends readonly Expr[],
	Star extends boolean,
	Distinct extends boolean,
	Ord extends readonly Expr[],
> =
	IsWord<T, I, "filter"> extends true
		? Expect<T, Next<I>, "("> extends infer J extends number
			? IsWord<T, J, "where"> extends true
				? ParseExpr<T, Next<J>> extends Ok<
						infer F extends Expr,
						infer J2 extends number
					>
					? Expect<T, J2, ")"> extends infer J3 extends number
						? CallOver<T, J3, Name, Args, Star, Distinct, Ord, F>
						: Expect<T, J2, ")">
					: ParseExpr<T, Next<J>>
				: SyntaxErr<T, J>
			: Expect<T, Next<I>, "(">
		: CallOver<T, I, Name, Args, Star, Distinct, Ord, null>;

type CallOver<
	T extends Toks,
	I extends number,
	Name,
	Args extends readonly Expr[],
	Star extends boolean,
	Distinct extends boolean,
	Ord extends readonly Expr[],
	Filter,
> =
	IsWord<T, I, "over"> extends true
		? ParseOver<T, Next<I>> extends Ok<
				infer Spec extends WindowSpec,
				infer J extends number
			>
			? Ok<MkCall<Name, Args, Star, Distinct, Ord, Filter, Spec>, J>
			: ParseOver<T, Next<I>>
		: Ok<MkCall<Name, Args, Star, Distinct, Ord, Filter, null>, I>;
type MkCall<Name, Args, Star, Distinct, Ord, Filter, Over> = {
	t: "call";
	name: Name extends readonly [infer N, unknown] ? N : never;
	disp: Name extends readonly [unknown, infer D] ? D : never;
	args: Args;
	star: Star;
	distinct: Distinct;
	order: Ord;
	filter: Filter;
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

export type OptBy<
	T extends Toks,
	I extends number,
	W extends "order" | "partition" | "group",
	Absent = [],
> =
	IsWord<T, I, W> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? W extends "order"
				? ParseOrderList<T, Next<Next<I>>, []>
				: ParseExprList<T, Next<Next<I>>, []>
			: SyntaxErr<T, Next<I>>
		: Ok<Absent, I>;

export type OptWhere<T extends Toks, I extends number> =
	IsWord<T, I, "where"> extends true ? ParseExpr<T, Next<I>> : Ok<null, I>;

export type ParenArgs<T extends Toks, I extends number> =
	IsOp<T, I, ")"> extends true
		? Ok<[], Next<I>>
		: ParseExprList<T, I, []> extends Ok<
					infer A extends readonly Expr[],
					infer J extends number
				>
			? CloseOk<T, J, A>
			: ParseExprList<T, I, []>;

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
		? OrderSuffix<T, J> extends infer J2 extends number
			? IsOp<T, J2, ","> extends true
				? ParseOrderList<T, Next<J2>, [...Acc, E]>
				: Ok<[...Acc, E], J2>
			: OrderSuffix<T, J>
		: ParseExpr<T, I>;
type OrderSuffix<T extends Toks, I extends number> = (
	IsWord<T, I, "asc" | "desc"> extends true
		? Next<I>
		: I
) extends infer J extends number
	? IsWord<T, J, "nulls"> extends true
		? IsWord<T, Next<J>, "first" | "last"> extends true
			? Next<Next<J>>
			: SyntaxErr<T, Next<J>>
		: J
	: never;

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

type BinPrec<O extends string> = O extends "||" | "->" | "->>"
	? Prec["cat"]
	: O extends "*" | "/" | "%"
		? Prec["mul"]
		: O extends "+" | "-"
			? Prec["add"]
			: O extends "&" | "|" | "<<" | ">>"
				? Prec["bit"]
				: O extends "<" | ">" | "<=" | ">="
					? Prec["cmp"]
					: O extends "=" | "==" | "!=" | "<>"
						? Prec["eq"]
						: null;

type InfixOp<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	O extends string,
> =
	BinPrec<O> extends infer P extends number
		? GE<P, Min> extends true
			? ParseExprPrec<T, Next<I>, Next<P>> extends Ok<
					infer E extends Expr,
					infer J extends number
				>
				? ParseInfix<
						T,
						J,
						{
							t: "bin";
							op: O extends "==" ? "=" : O extends "<>" ? "!=" : O;
							l: L;
							r: E;
						},
						Min
					>
				: ParseExprPrec<T, Next<I>, Next<P>>
			: Ok<L, I>
		: Ok<L, I>;

type LikeOp = "like" | "glob" | "match" | "regexp";

type InfixWord<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
> = W extends "or" | "and"
	? GE<W extends "or" ? 1 : 2, Min> extends true
		? ParseExprPrec<T, Next<I>, W extends "or" ? 2 : 3> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? ParseInfix<T, J, { t: "bin"; op: W; l: L; r: E }, Min>
			: ParseExprPrec<T, Next<I>, W extends "or" ? 2 : 3>
		: Ok<L, I>
	: W extends "collate"
		? GE<Prec["collate"], Min> extends true
			? Ident<T, Next<I>> extends infer N extends Name
				? ParseInfix<
						T,
						Next<Next<I>>,
						{ t: "collate"; e: L; collation: N["v"] },
						Min
					>
				: T[Next<I>] extends {
							readonly k: "s";
							readonly v: infer V extends string;
						}
					? ParseInfix<
							T,
							Next<Next<I>>,
							{ t: "collate"; e: L; collation: Lowercase<V> },
							Min
						>
					: SyntaxErr<T, Next<I>>
			: Ok<L, I>
		: GE<Prec["eq"], Min> extends true
			? W extends "isnull" | "notnull"
				? ParseInfix<
						T,
						Next<I>,
						{
							t: "is";
							e: L;
							what: "null";
							not: W extends "notnull" ? true : false;
						},
						Min
					>
				: W extends "is"
					? ParseIs<T, Next<I>, L, Min>
					: W extends "not"
						? T[Next<I>] extends {
								readonly k: "w";
								readonly v: infer W2 extends string;
							}
							? W2 extends "null"
								? ParseInfix<
										T,
										Next<Next<I>>,
										{ t: "is"; e: L; what: "null"; not: true },
										Min
									>
								: W2 extends "in" | "between" | LikeOp
									? ParsePredicate<T, Next<Next<I>>, L, Min, W2, true>
									: Ok<L, I>
							: Ok<L, I>
						: W extends "in" | "between" | LikeOp
							? ParsePredicate<T, Next<I>, L, Min, W, false>
							: Ok<L, I>
			: Ok<L, I>;

type ParseIs<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
> = (IsWord<T, I, "not"> extends true ? [true, Next<I>] : [false, I]) extends [
	infer Not extends boolean,
	infer J extends number,
]
	? IsWord<T, J, "distinct"> extends true
		? IsWord<T, Next<J>, "from"> extends true
			? ParseExprPrec<T, Next<Next<J>>, Prec["cmp"]> extends Ok<
					infer E extends Expr,
					infer J2 extends number
				>
				? ParseInfix<
						T,
						J2,
						{
							t: "isdistinct";
							l: L;
							r: E;
							not: Not extends true ? false : true;
						},
						Min
					>
				: ParseExprPrec<T, Next<Next<J>>, Prec["cmp"]>
			: SyntaxErr<T, Next<J>>
		: ParseExprPrec<T, J, Prec["cmp"]> extends Ok<
					infer E extends Expr,
					infer J2 extends number
				>
			? ParseInfix<
					T,
					J2,
					E extends { readonly t: "null" }
						? { t: "is"; e: L; what: "null"; not: Not }
						: {
								t: "isdistinct";
								l: L;
								r: E;
								not: Not extends true ? false : true;
							},
					Min
				>
			: ParseExprPrec<T, J, Prec["cmp"]>
	: never;

type ParsePredicate<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
	Not extends boolean,
> = W extends "between"
	? ParseExprPrec<T, I, Prec["not"]> extends Ok<
			infer LoE extends Expr,
			infer J extends number
		>
		? IsWord<T, J, "and"> extends true
			? ParseExprPrec<T, Next<J>, Prec["cmp"]> extends Ok<
					infer HiE extends Expr,
					infer J2 extends number
				>
				? ParseInfix<
						T,
						J2,
						{ t: "between"; e: L; lo: LoE; hi: HiE; not: Not },
						Min
					>
				: ParseExprPrec<T, Next<J>, Prec["cmp"]>
			: SyntaxErr<T, J>
		: ParseExprPrec<T, I, Prec["not"]>
	: W extends "in"
		? ParseIn<T, I, L, Min, Not>
		: W extends LikeOp
			? ParseExprPrec<T, I, Prec["cmp"]> extends Ok<
					infer Pat extends Expr,
					infer J extends number
				>
				? IsWord<T, J, "escape"> extends true
					? ParseExprPrec<T, Next<J>, Prec["cmp"]> extends Ok<
							infer EsE extends Expr,
							infer J2 extends number
						>
						? ParseInfix<
								T,
								J2,
								{ t: "like"; e: L; pat: Pat; esc: EsE; kind: W; not: Not },
								Min
							>
						: ParseExprPrec<T, Next<J>, Prec["cmp"]>
					: ParseInfix<
							T,
							J,
							{ t: "like"; e: L; pat: Pat; esc: null; kind: W; not: Not },
							Min
						>
				: ParseExprPrec<T, I, Prec["cmp"]>
			: never;

type ParseIn<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	Not extends boolean,
> =
	IsOp<T, I, "("> extends true
		? IsWord<T, Next<I>, "select" | "with" | "values"> extends true
			? ParenSubquery<T, Next<I>> extends Ok<
					infer Q extends SelectStmt,
					infer J extends number
				>
				? ParseInfix<T, J, { t: "insub"; e: L; q: Q; not: Not }, Min>
				: ParenSubquery<T, Next<I>>
			: ParenArgs<T, Next<I>> extends Ok<
						infer List extends readonly Expr[],
						infer J extends number
					>
				? ParseInfix<T, J, { t: "in"; e: L; list: List; not: Not }, Min>
				: ParenArgs<T, Next<I>>
		: TableRefAt<T, I> extends Ok<
					infer R extends TableRef,
					infer J extends number
				>
			? InTable<T, J, L, Min, Not, R>
			: TableRefAt<T, I>;
type InTable<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	Not extends boolean,
	R extends TableRef,
> =
	(
		IsOp<T, I, "("> extends true
			? ParenArgs<T, Next<I>>
			: Ok<null, I>
	) extends Ok<
		infer Args extends readonly Expr[] | null,
		infer J extends number
	>
		? ParseInfix<
				T,
				J,
				{
					t: "intable";
					e: L;
					schema: R["schema"];
					table: R["name"];
					args: Args;
					not: Not;
				},
				Min
			>
		: ParenArgs<T, Next<I>>;
