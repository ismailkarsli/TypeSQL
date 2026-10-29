import type { SqlError } from "../../../errors.js";
import type { Expr, SelectStmt, WindowSpec } from "../ast.js";
import type { NameOf } from "../tokens.js";
import type { Reserved } from "./keywords.js";
import type { ParseSubquery } from "./select.js";
import type {
	Expect,
	Ident,
	IsOp,
	IsWord,
	Name,
	Nx,
	Ok,
	SyntaxErr,
	Toks,
} from "./util.js";

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

type AtLeast<P extends number, Min extends number> = Min extends 0
	? true
	: [Tup<P>] extends [[...Tup<Min>, ...unknown[]]]
		? true
		: false;
type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N
	? A
	: Tup<N, [...A, 0]>;

export type ParseExpr<T extends Toks, I extends number> = ParseExprPrec<
	T,
	I,
	0
>;

export type ParseExprPrec<
	T extends Toks,
	I extends number,
	Min extends number,
> =
	ParsePrefix<T, I> extends infer L
		? L extends Ok<infer E extends Expr, infer J extends number>
			? ParseInfix<T, J, E, Min>
			: L
		: never;

type ParsePrefix<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: infer O;
}
	? O extends "-" | "+" | "~"
		? ParseExprPrec<T, Nx<I>, Prec["unary"]> extends infer R
			? R extends Ok<infer E extends Expr, infer J extends number>
				? Ok<Unary<O, E>, J>
				: R
			: never
		: O extends "("
			? ParseParen<T, Nx<I>>
			: SyntaxErr<T, I>
	: T[I] extends { readonly k: "w"; readonly v: "not" }
		? ParseExprPrec<T, Nx<I>, Prec["not"]> extends infer R
			? R extends Ok<infer E extends Expr, infer J extends number>
				? Ok<{ t: "un"; op: "not"; e: E }, J>
				: R
			: never
		: ParsePrimary<T, I>;

type Unary<O, E extends Expr> = O extends "-"
	? E extends { readonly t: "num"; readonly v: infer V extends string }
		? { t: "num"; v: `-${V}` }
		: { t: "un"; op: "-"; e: E }
	: { t: "un"; op: O; e: E };

type ParseParen<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: "select" | "with" | "values";
}
	? ParseSubquery<T, I> extends infer R
		? R extends Ok<infer Q extends SelectStmt, infer J extends number>
			? Expect<T, J, ")"> extends infer J2
				? J2 extends number
					? Ok<{ t: "sub"; q: Q }, J2>
					: J2
				: never
			: R
		: never
	: ParseExprList<T, I, []> extends infer R
		? R extends Ok<infer L extends readonly Expr[], infer J extends number>
			? Expect<T, J, ")"> extends infer J2
				? J2 extends number
					? L extends readonly [infer One extends Expr]
						? Ok<One, J2>
						: Ok<{ t: "row"; items: L }, J2>
					: J2
				: never
			: R
		: never;

export type ParseExprList<
	T extends Toks,
	I extends number,
	Acc extends readonly Expr[],
> =
	ParseExpr<T, I> extends infer R
		? R extends Ok<infer E extends Expr, infer J extends number>
			? IsOp<T, J, ","> extends true
				? ParseExprList<T, Nx<J>, [...Acc, E]>
				: Ok<[...Acc, E], J>
			: R
		: never;

type ParsePrimary<T extends Toks, I extends number> = T[I] extends {
	readonly k: "n";
	readonly v: infer V extends string;
}
	? Ok<{ t: "num"; v: V }, Nx<I>>
	: T[I] extends { readonly k: "s"; readonly v: infer V extends string }
		? T[I] extends { readonly blob: true }
			? Ok<{ t: "blob"; v: V }, Nx<I>>
			: Ok<{ t: "str"; v: V }, Nx<I>>
		: T[I] extends { readonly k: "$"; readonly v: infer N extends number }
			? Ok<{ t: "param"; n: N }, Nx<I>>
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
	? Ok<{ t: "null" }, Nx<I>>
	: W extends "current_time" | "current_date" | "current_timestamp"
		? Ok<{ t: "ctime"; fn: W }, Nx<I>>
		: W extends "cast"
			? ParseCast<T, Nx<I>>
			: W extends "case"
				? ParseCase<T, Nx<I>>
				: W extends "exists"
					? Expect<T, Nx<I>, "("> extends infer J
						? J extends number
							? ParseSubquery<T, J> extends infer R
								? R extends Ok<
										infer Q extends SelectStmt,
										infer J2 extends number
									>
									? Expect<T, J2, ")"> extends infer J3
										? J3 extends number
											? Ok<{ t: "exists"; q: Q }, J3>
											: J3
										: never
									: R
								: never
							: J
						: never
					: W extends "raise"
						? SqlError<"RAISE() may only be used within a trigger-program", I>
						: IsOp<T, Nx<I>, "("> extends true
							? W extends Reserved
								? SyntaxErr<T, I>
								: ParseCall<T, I, [W, NameOf<T[I]> & string]>
							: W extends "true" | "false"
								? IsOp<T, Nx<I>, "."> extends true
									? ParseColumnRef<T, I>
									: Ok<{ t: "bool"; v: W extends "true" ? true : false }, Nx<I>>
								: ParseColumnRef<T, I>;

type ParseColumnRef<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Nx<I>, "."> extends true
			? Ident<T, Nx<Nx<I>>> extends infer B extends Name
				? IsOp<T, Nx<Nx<Nx<I>>>, "."> extends true
					? Ident<T, Nx<Nx<Nx<Nx<I>>>>> extends infer C extends Name
						? Ok<
								{
									t: "col";
									schema: A["v"];
									tbl: B["v"];
									name: C["v"];
									disp: `${A["n"]}.${B["n"]}.${C["n"]}`;
								},
								Nx<Nx<Nx<Nx<Nx<I>>>>>
							>
						: SyntaxErr<T, Nx<Nx<Nx<Nx<I>>>>>
					: Ok<
							{
								t: "col";
								schema: null;
								tbl: A["v"];
								name: B["v"];
								disp: `${A["n"]}.${B["n"]}`;
							},
							Nx<Nx<Nx<I>>>
						>
				: SyntaxErr<T, Nx<Nx<I>>>
			: Ok<
					{
						t: "col";
						schema: null;
						tbl: null;
						name: A["v"];
						disp: T[I] extends { readonly r: `"${string}` }
							? `"${A["n"]}" - should this be a string literal in single-quotes?`
							: A["n"];
					},
					Nx<I>
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
			? TypeWords<T, Nx<I>, Acc extends "" ? V : `${Acc} ${V}`>
			: never
	: T[I] extends { readonly k: "s"; readonly v: infer V extends string }
		? TypeWords<T, Nx<I>, Acc extends "" ? V : `${Acc} ${V}`>
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
			: TypeArg<T, Nx<I>> extends infer J
				? J extends number
					? IsOp<T, J, ","> extends true
						? TypeArg<T, Nx<J>> extends infer J2
							? J2 extends number
								? Expect<T, J2, ")"> extends infer J3
									? J3 extends number
										? Ok<Acc, J3>
										: J3
									: never
								: J2
							: never
						: Expect<T, J, ")"> extends infer J3
							? J3 extends number
								? Ok<Acc, J3>
								: J3
							: never
					: J
				: never
		: Ok<Acc, I>;
type TypeArg<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: "+" | "-";
}
	? T[Nx<I>] extends { readonly k: "n" }
		? Nx<Nx<I>>
		: SyntaxErr<T, Nx<I>>
	: T[I] extends { readonly k: "n" }
		? Nx<I>
		: T[I] extends { readonly k: "w" | "id" }
			? Nx<I>
			: SyntaxErr<T, I>;

type ParseCast<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J
		? J extends number
			? ParseExpr<T, J> extends infer R
				? R extends Ok<infer E extends Expr, infer J2 extends number>
					? IsWord<T, J2, "as"> extends true
						? ParseTypeName<T, Nx<J2>> extends infer TN
							? TN extends Ok<infer Ty extends string, infer J3 extends number>
								? Expect<T, J3, ")"> extends infer J4
									? J4 extends number
										? Ok<{ t: "cast"; e: E; to: Ty }, J4>
										: J4
									: never
								: TN
							: never
						: SyntaxErr<T, J2>
					: R
				: never
			: J
		: never;

type ParseCase<T extends Toks, I extends number> =
	IsWord<T, I, "when"> extends true
		? ParseWhens<T, I, null, []>
		: ParseExpr<T, I> extends infer R
			? R extends Ok<infer E extends Expr, infer J extends number>
				? IsWord<T, J, "when"> extends true
					? ParseWhens<T, J, E, []>
					: SyntaxErr<T, J>
				: R
			: never;
type ParseWhens<
	T extends Toks,
	I extends number,
	Operand,
	Acc extends readonly unknown[],
> =
	IsWord<T, I, "when"> extends true
		? ParseExpr<T, Nx<I>> extends infer W
			? W extends Ok<infer C extends Expr, infer J extends number>
				? IsWord<T, J, "then"> extends true
					? ParseExpr<T, Nx<J>> extends infer R
						? R extends Ok<infer V extends Expr, infer J2 extends number>
							? ParseWhens<T, J2, Operand, [...Acc, { when: C; then: V }]>
							: R
						: never
					: SyntaxErr<T, J>
				: W
			: never
		: Acc extends readonly []
			? SyntaxErr<T, I>
			: IsWord<T, I, "else"> extends true
				? ParseExpr<T, Nx<I>> extends infer R
					? R extends Ok<infer E extends Expr, infer J extends number>
						? IsWord<T, J, "end"> extends true
							? Ok<{ t: "case"; operand: Operand; whens: Acc; else: E }, Nx<J>>
							: SyntaxErr<T, J>
						: R
					: never
				: IsWord<T, I, "end"> extends true
					? Ok<{ t: "case"; operand: Operand; whens: Acc; else: null }, Nx<I>>
					: SyntaxErr<T, I>;

type ParseCall<T extends Toks, I extends number, Name> =
	IsOp<T, Nx<Nx<I>>, ")"> extends true
		? CallTail<T, Nx<Nx<Nx<I>>>, Name, [], false, false, []>
		: IsOp<T, Nx<Nx<I>>, "*"> extends true
			? Expect<T, Nx<Nx<Nx<I>>>, ")"> extends infer J
				? J extends number
					? CallTail<T, J, Name, [], true, false, []>
					: J
				: never
			: CallArgs<
					T,
					IsWord<T, Nx<Nx<I>>, "distinct" | "all"> extends true
						? Nx<Nx<Nx<I>>>
						: Nx<Nx<I>>,
					Name,
					IsWord<T, Nx<Nx<I>>, "distinct">
				>;
type CallArgs<
	T extends Toks,
	I extends number,
	Name,
	Distinct extends boolean,
> =
	ParseExprList<T, I, []> extends infer R
		? R extends Ok<infer Args extends readonly Expr[], infer J extends number>
			? IsWord<T, J, "order"> extends true
				? IsWord<T, Nx<J>, "by"> extends true
					? ParseOrderList<T, Nx<Nx<J>>, []> extends infer O
						? O extends Ok<
								infer Ord extends readonly Expr[],
								infer J2 extends number
							>
							? Expect<T, J2, ")"> extends infer J3
								? J3 extends number
									? CallTail<T, J3, Name, Args, false, Distinct, Ord>
									: J3
								: never
							: O
						: never
					: SyntaxErr<T, Nx<J>>
				: Expect<T, J, ")"> extends infer J3
					? J3 extends number
						? CallTail<T, J3, Name, Args, false, Distinct, []>
						: J3
					: never
			: R
		: never;

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
		? Expect<T, Nx<I>, "("> extends infer J
			? J extends number
				? IsWord<T, J, "where"> extends true
					? ParseExpr<T, Nx<J>> extends infer R
						? R extends Ok<infer F extends Expr, infer J2 extends number>
							? Expect<T, J2, ")"> extends infer J3
								? J3 extends number
									? CallOver<T, J3, Name, Args, Star, Distinct, Ord, F>
									: J3
								: never
							: R
						: never
					: SyntaxErr<T, J>
				: J
			: never
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
		? ParseOver<T, Nx<I>> extends infer W
			? W extends Ok<infer Spec extends WindowSpec, infer J extends number>
				? Ok<MkCall<Name, Args, Star, Distinct, Ord, Filter, Spec>, J>
				: W
			: never
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

export type ParseOver<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? Ok<{ name: N["v"]; partition: []; order: [] }, Nx<I>>
		: IsOp<T, I, "("> extends true
			? ParseWindowSpec<T, Nx<I>>
			: SyntaxErr<T, I>;

export type ParseWindowSpec<T extends Toks, I extends number> = (
	Ident<T, I> extends infer N extends Name
		? IsWord<
				T,
				I,
				"partition" | "order" | "rows" | "range" | "groups"
			> extends true
			? [null, I]
			: [N["v"], Nx<I>]
		: [null, I]
) extends [infer Base, infer I1 extends number]
	? (
			IsWord<T, I1, "partition"> extends true
				? IsWord<T, Nx<I1>, "by"> extends true
					? ParseExprList<T, Nx<Nx<I1>>, []>
					: SyntaxErr<T, Nx<I1>>
				: Ok<[], I1>
		) extends infer P
		? P extends Ok<infer Part extends readonly Expr[], infer I2 extends number>
			? (
					IsWord<T, I2, "order"> extends true
						? IsWord<T, Nx<I2>, "by"> extends true
							? ParseOrderList<T, Nx<Nx<I2>>, []>
							: SyntaxErr<T, Nx<I2>>
						: Ok<[], I2>
				) extends infer O
				? O extends Ok<
						infer Ord extends readonly Expr[],
						infer I3 extends number
					>
					? SkipFrame<T, I3, []> extends infer J
						? J extends number
							? Ok<{ name: Base; partition: Part; order: Ord }, J>
							: J
						: never
					: O
				: never
			: P
		: never
	: never;

type SkipFrame<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[],
> = T[I] extends { readonly k: "o"; readonly v: "(" }
	? SkipFrame<T, Nx<I>, [...Depth, 0]>
	: T[I] extends { readonly k: "o"; readonly v: ")" }
		? Depth extends readonly [unknown, ...infer D]
			? SkipFrame<T, Nx<I>, D>
			: Nx<I>
		: T[I] extends { readonly k: string }
			? SkipFrame<T, Nx<I>, Depth>
			: SyntaxErr<T, I>;

export type ParseOrderList<
	T extends Toks,
	I extends number,
	Acc extends readonly Expr[],
> =
	ParseExpr<T, I> extends infer R
		? R extends Ok<infer E extends Expr, infer J extends number>
			? OrderSuffix<T, J> extends infer J2 extends number
				? IsOp<T, J2, ","> extends true
					? ParseOrderList<T, Nx<J2>, [...Acc, E]>
					: Ok<[...Acc, E], J2>
				: OrderSuffix<T, J>
			: R
		: never;
type OrderSuffix<T extends Toks, I extends number> = (
	IsWord<T, I, "asc" | "desc"> extends true
		? Nx<I>
		: I
) extends infer J extends number
	? IsWord<T, J, "nulls"> extends true
		? IsWord<T, Nx<J>, "first" | "last"> extends true
			? Nx<Nx<J>>
			: SyntaxErr<T, Nx<J>>
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
		? AtLeast<P, Min> extends true
			? ParseExprPrec<T, Nx<I>, Next1<P>> extends infer R
				? R extends Ok<infer E extends Expr, infer J extends number>
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
					: R
				: never
			: Ok<L, I>
		: Ok<L, I>;

type Next1<P extends number> = [...Tup<P>, 0]["length"] & number;

type LikeOp = "like" | "glob" | "match" | "regexp";

type InfixWord<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
> = W extends "or" | "and"
	? AtLeast<W extends "or" ? 1 : 2, Min> extends true
		? ParseExprPrec<T, Nx<I>, W extends "or" ? 2 : 3> extends infer R
			? R extends Ok<infer E extends Expr, infer J extends number>
				? ParseInfix<T, J, { t: "bin"; op: W; l: L; r: E }, Min>
				: R
			: never
		: Ok<L, I>
	: W extends "collate"
		? AtLeast<Prec["collate"], Min> extends true
			? Ident<T, Nx<I>> extends infer N extends Name
				? ParseInfix<
						T,
						Nx<Nx<I>>,
						{ t: "collate"; e: L; collation: N["v"] },
						Min
					>
				: T[Nx<I>] extends {
							readonly k: "s";
							readonly v: infer V extends string;
						}
					? ParseInfix<
							T,
							Nx<Nx<I>>,
							{ t: "collate"; e: L; collation: Lowercase<V> },
							Min
						>
					: SyntaxErr<T, Nx<I>>
			: Ok<L, I>
		: AtLeast<Prec["eq"], Min> extends true
			? W extends "isnull" | "notnull"
				? ParseInfix<
						T,
						Nx<I>,
						{
							t: "is";
							e: L;
							what: "null";
							not: W extends "notnull" ? true : false;
						},
						Min
					>
				: W extends "is"
					? ParseIs<T, Nx<I>, L, Min>
					: W extends "not"
						? T[Nx<I>] extends {
								readonly k: "w";
								readonly v: infer W2 extends string;
							}
							? W2 extends "null"
								? ParseInfix<
										T,
										Nx<Nx<I>>,
										{ t: "is"; e: L; what: "null"; not: true },
										Min
									>
								: W2 extends "in" | "between" | LikeOp
									? ParsePredicate<T, Nx<Nx<I>>, L, Min, W2, true>
									: Ok<L, I>
							: Ok<L, I>
						: W extends "in" | "between" | LikeOp
							? ParsePredicate<T, Nx<I>, L, Min, W, false>
							: Ok<L, I>
			: Ok<L, I>;

type ParseIs<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
> = (IsWord<T, I, "not"> extends true ? [true, Nx<I>] : [false, I]) extends [
	infer Not extends boolean,
	infer J extends number,
]
	? IsWord<T, J, "distinct"> extends true
		? IsWord<T, Nx<J>, "from"> extends true
			? ParseExprPrec<T, Nx<Nx<J>>, Prec["cmp"]> extends infer R
				? R extends Ok<infer E extends Expr, infer J2 extends number>
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
					: R
				: never
			: SyntaxErr<T, Nx<J>>
		: ParseExprPrec<T, J, Prec["cmp"]> extends infer R
			? R extends Ok<infer E extends Expr, infer J2 extends number>
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
				: R
			: never
	: never;

type ParsePredicate<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	W extends string,
	Not extends boolean,
> = W extends "between"
	? ParseExprPrec<T, I, Prec["not"]> extends infer Lo
		? Lo extends Ok<infer LoE extends Expr, infer J extends number>
			? IsWord<T, J, "and"> extends true
				? ParseExprPrec<T, Nx<J>, Prec["cmp"]> extends infer Hi
					? Hi extends Ok<infer HiE extends Expr, infer J2 extends number>
						? ParseInfix<
								T,
								J2,
								{ t: "between"; e: L; lo: LoE; hi: HiE; not: Not },
								Min
							>
						: Hi
					: never
				: SyntaxErr<T, J>
			: Lo
		: never
	: W extends "in"
		? ParseIn<T, I, L, Min, Not>
		: ParseExprPrec<T, I, Prec["cmp"]> extends infer P
			? P extends Ok<infer Pat extends Expr, infer J extends number>
				? IsWord<T, J, "escape"> extends true
					? ParseExprPrec<T, Nx<J>, Prec["cmp"]> extends infer Es
						? Es extends Ok<infer EsE extends Expr, infer J2 extends number>
							? ParseInfix<
									T,
									J2,
									{ t: "like"; e: L; pat: Pat; esc: EsE; kind: W; not: Not },
									Min
								>
							: Es
						: never
					: ParseInfix<
							T,
							J,
							{ t: "like"; e: L; pat: Pat; esc: null; kind: W; not: Not },
							Min
						>
				: P
			: never;

type ParseIn<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	Not extends boolean,
> =
	IsOp<T, I, "("> extends true
		? IsOp<T, Nx<I>, ")"> extends true
			? ParseInfix<T, Nx<Nx<I>>, { t: "in"; e: L; list: []; not: Not }, Min>
			: IsWord<T, Nx<I>, "select" | "with" | "values"> extends true
				? ParseSubquery<T, Nx<I>> extends infer R
					? R extends Ok<infer Q extends SelectStmt, infer J extends number>
						? Expect<T, J, ")"> extends infer J2
							? J2 extends number
								? ParseInfix<T, J2, { t: "insub"; e: L; q: Q; not: Not }, Min>
								: J2
							: never
						: R
					: never
				: ParseExprList<T, Nx<I>, []> extends infer R
					? R extends Ok<
							infer List extends readonly Expr[],
							infer J extends number
						>
						? Expect<T, J, ")"> extends infer J2
							? J2 extends number
								? ParseInfix<
										T,
										J2,
										{ t: "in"; e: L; list: List; not: Not },
										Min
									>
								: J2
							: never
						: R
					: never
		: Ident<T, I> extends infer A extends Name
			? IsOp<T, Nx<I>, "."> extends true
				? Ident<T, Nx<Nx<I>>> extends infer B extends Name
					? InTable<T, Nx<Nx<Nx<I>>>, L, Min, Not, A["v"], B["v"]>
					: SyntaxErr<T, Nx<Nx<I>>>
				: InTable<T, Nx<I>, L, Min, Not, null, A["v"]>
			: SyntaxErr<T, I>;
type InTable<
	T extends Toks,
	I extends number,
	L extends Expr,
	Min extends number,
	Not extends boolean,
	Schema,
	Tbl,
> =
	IsOp<T, I, "("> extends true
		? (
				IsOp<T, Nx<I>, ")"> extends true
					? Ok<[], Nx<I>>
					: ParseExprList<T, Nx<I>, []>
			) extends infer R
			? R extends Ok<infer Args extends readonly Expr[], infer J extends number>
				? Expect<T, J, ")"> extends infer J2
					? J2 extends number
						? ParseInfix<
								T,
								J2,
								{
									t: "intable";
									e: L;
									schema: Schema;
									table: Tbl;
									args: Args;
									not: Not;
								},
								Min
							>
						: J2
					: never
				: R
			: never
		: ParseInfix<
				T,
				I,
				{
					t: "intable";
					e: L;
					schema: Schema;
					table: Tbl;
					args: null;
					not: Not;
				},
				Min
			>;
