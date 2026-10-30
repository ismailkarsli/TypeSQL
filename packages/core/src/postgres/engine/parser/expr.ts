import type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Toks,
	WordTok,
} from "../../../engine/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { IsTest } from "../ast.js";
import type { JsonFuncWord, ParseJsonFunc, SkipUniqueKeys } from "./json.js";
import type {
	NotBareLabel,
	NotColId,
	NotTypeFuncName,
	ReservedKeyword,
} from "./keywords.js";
import type {
	EndsTargetList,
	IsSelectStart,
	ParseSelectStmt,
} from "./select.js";
import type {
	IntervalFields,
	ParsePrecision,
	ParseTypeName,
} from "./typename.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	FuncName,
	Nx,
	Nx2,
	Nx3,
	Ok,
	QualName,
	SkipWord,
	SyntaxErrorAt,
} from "./util.js";
import type { ParseXmlFunc, XmlFuncKeyword, XmlIsDocument } from "./xml.js";

export type ColNode<Tbl, Name> = { t: "col"; tbl: Tbl; name: Name };
type NumNode<V> = { t: "num"; v: V };
type StrNode<V> = { t: "str"; v: V };
type ParamNode<N> = { t: "param"; n: N };
type BinNode<Op, L, R> = { t: "bin"; op: Op; l: L; r: R };
type UnNode<Op, E> = { t: "un"; op: Op; e: E };
type CastNode<E, To> = { t: "cast"; e: E; to: To };

type QuantNode<L, Op, Quantifier, R> = {
	t: "quant";
	l: L;
	op: Op;
	q: Quantifier;
	r: R;
};
type IdxNode<E, I> = { t: "idx"; e: E; i: I };
type SliceNode<E, Lo, Hi> = { t: "slice"; e: E; lo: Lo; hi: Hi };
type FieldNode<E, Name> = { t: "field"; e: E; name: Name };
type IsJsonNode<E, Not> = { t: "isjson"; e: E; not: Not };
type DistinctNode<L, R, Not> = { t: "isdistinct"; l: L; r: R; not: Not };
type InSubNode<E, Q, Not> = { t: "insub"; e: E; q: Q; not: Not };
type InNode<E, List, Not> = { t: "in"; e: E; list: List; not: Not };
type LikeNode<E, Pat, Kind, Not> = {
	t: "like";
	e: E;
	pat: Pat;
	kind: Kind;
	not: Not;
};
type BetweenNode<E, Lo, Hi, Not> = {
	t: "between";
	e: E;
	lo: Lo;
	hi: Hi;
	not: Not;
};
type AtTzNode<E, Zone> = { t: "attz"; e: E; zone: Zone };
type CollateNode<E, Collation> = { t: "collate"; e: E; collation: Collation };
type StarNode<Tbl> = { t: "star"; tbl: Tbl };
type BoolNode<V> = { t: "bool"; v: V };
type TypedNode<Type, V> = { t: "typed"; type: Type; v: V };
type SubNode<Q> = { t: "sub"; q: Q };
type RowNode<Items> = { t: "row"; items: Items };
type VariadicNode<E> = { t: "variadic"; e: E };
type NamedNode<Name, E> = { t: "named"; name: Name; e: E };
type CaseNode<Operand, Whens, Else> = {
	t: "case";
	operand: Operand;
	whens: Whens;
	else: Else;
};
type ExistsNode<Q> = { t: "exists"; q: Q };
type ArraySubNode<Q> = { t: "arraysub"; q: Q };
type ArrayNode<Items> = { t: "array"; items: Items };
type ExtractNode<Field, E> = { t: "extract"; field: Field; e: E };
type PositionNode<Sub, In> = { t: "position"; sub: Sub; in: In };
type SubstringNode<E, From, For> = {
	t: "substring";
	e: E;
	from: From;
	for: For;
};
type TrimNode<E, Chars, Side> = { t: "trim"; e: E; chars: Chars; side: Side };
type OverlayNode<E, Placing, From, For> = {
	t: "overlay";
	e: E;
	placing: Placing;
	from: From;
	for: For;
};
type CallNode<Name, Args, Distinct, Filter, Over, Win, WithinGroup> = {
	t: "call";
	name: Name;
	args: Args;
	distinct: Distinct;
	filter: Filter;
	over: Over;
	win: Win;
	withinGroup: WithinGroup;
};

export type ParseExpr<
	T extends Toks,
	I extends number,
	Min extends MinPrec = 0,
> =
	T[I] extends ParamTok<infer N>
		? T[Nx<I>] extends OpTok<Terminator> | undefined
			? Ok<ParamNode<N>, Nx<I>>
			: ParseInfix<T, ParamNode<N>, Nx<I>, Min>
		: T[I] extends WordTok | IdTok
			? T[I] extends WordTok<PrefixKeyword>
				? ParseExprSlow<T, I, Min>
				: ColumnPrefix<T[I], T[Nx<I>], T[Nx2<I>], T[Nx3<I>]> extends infer P
					? P extends [infer L, infer N]
						? ParseInfix<T, L, N extends 1 ? Nx<I> : Nx3<I>, Min>
						: ParseExprSlow<T, I, Min>
					: never
			: ParseExprSlow<T, I, Min>;

type ParseExprSlow<T extends Toks, I extends number, Min extends MinPrec> =
	ParsePrefix<T, I> extends infer R
		? R extends Ok<infer L, infer J>
			? ParseInfix<T, L, J, Min>
			: R
		: never;

export type Prec = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
type MinPrec = Prec | "target";
type Geq = {
	target: Prec;
	0: Prec;
	1: Exclude<Prec, 0>;
	2: Exclude<Prec, 0 | 1>;
	3: Exclude<Prec, 0 | 1 | 2>;
	4: Exclude<Prec, 0 | 1 | 2 | 3>;
	5: Exclude<Prec, 0 | 1 | 2 | 3 | 4>;
	6: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5>;
	7: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6>;
	8: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>;
	9: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>;
	10: 10 | 11 | 12 | 13;
	11: 11 | 12 | 13;
	12: 12 | 13;
	13: 13;
};
type Binds<Bp extends Prec, Min extends MinPrec> = Bp extends Geq[Min]
	? true
	: false;
type NextPrec = {
	0: 1;
	1: 2;
	2: 3;
	3: 4;
	4: 5;
	5: 6;
	6: 7;
	7: 8;
	8: 9;
	9: 10;
	10: 11;
	11: 12;
	12: 13;
	13: 13;
};

type ComparisonOp = "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=";
type NotPrefixOp =
	| "/"
	| "%"
	| "^"
	| "<"
	| ">"
	| "="
	| "<="
	| ">="
	| "<>"
	| "!="
	| "=>"
	| ")"
	| ","
	| ";"
	| "]"
	| "."
	| ":"
	| "::"
	| ":=";
type Terminator = "(" | ")" | "," | ";" | "]" | ":";

type ParseInfix<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
> = Min extends "target"
	? T[I] extends WordTok<infer W>
		? W extends NotBareLabel
			? ParseInfixAt<T, L, I, Min>
			: T[Nx<I>] extends OpTok<",">
				? Ok<L, I>
				: EndsTargetList<T, Nx<I>> extends true
					? Ok<L, I>
					: ParseInfixAt<T, L, I, Min>
		: ParseInfixAt<T, L, I, Min>
	: ParseInfixAt<T, L, I, Min>;
// Classify a token independently of its enclosing stream and left expression.
type InfixAction<H, Min extends MinPrec> =
	H extends OpTok<infer O>
		? O extends Terminator | "=>" | ":="
			? "done"
			: O extends "::"
				? Binds<12, Min> extends true
					? "cast"
					: "done"
				: O extends "["
					? "subscript"
					: O extends "."
						? "field"
						: O extends ComparisonOp
							? Binds<5, Min> extends true
								? "comparison"
								: "done"
							: O extends "+" | "-"
								? "add"
								: O extends "*" | "/" | "%"
									? "multiply"
									: O extends "^"
										? "power"
										: "binary"
		: H extends WordTok<infer W>
			? W extends "and"
				? Binds<2, Min> extends true
					? "and"
					: "done"
				: W extends "or"
					? Binds<1, Min> extends true
						? "or"
						: "done"
					: W extends "is" | "isnull" | "notnull"
						? Binds<4, Min> extends true
							? W
							: "done"
						: W extends "not" | "in" | "like" | "ilike" | "similar" | "between"
							? Binds<6, Min> extends true
								? W
								: "done"
							: W extends "at" | "collate"
								? Binds<11, Min> extends true
									? W
									: "done"
								: W extends "operator" | "overlaps"
									? W
									: "done"
			: "done";

type ParseInfixAt<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
> = ExecuteInfix<InfixAction<T[I], Min>, T, L, I, Min>;
type ExecuteInfix<
	K,
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
> = K extends "done"
	? Ok<L, I>
	: K extends "cast"
		? ParseCastSuffix<T, L, Nx<I>, Min>
		: K extends "subscript"
			? L extends Indirectable | TagColParam
				? ParseSubscript<T, L, Nx<I>, Min>
				: Ok<L, I>
			: K extends "field"
				? L extends Indirectable
					? ParseFieldAccess<T, L, Nx<I>, Min>
					: Ok<L, I>
				: K extends "comparison"
					? ParseComparisonRhs<T, L, T[I]["v"] & string, Nx<I>, Min>
					: K extends "add"
						? BinRhs<T, L, T[I]["v"] & string, 8, I, Nx<I>, Min>
						: K extends "multiply"
							? BinRhs<T, L, T[I]["v"] & string, 9, I, Nx<I>, Min>
							: K extends "power"
								? BinRhs<T, L, T[I]["v"] & string, 10, I, Nx<I>, Min>
								: K extends "binary"
									? BinRhs<T, L, T[I]["v"] & string, 7, I, Nx<I>, Min>
									: K extends "and"
										? ParseChain<T, "and", 3, [L], Nx<I>, Min>
										: K extends "or"
											? ParseChain<T, "or", 2, [L], Nx<I>, Min>
											: K extends "is"
												? ParseIs<T, L, Nx<I>, Min>
												: K extends "isnull"
													? ParseInfix<T, IsTest_<L, "null", false>, Nx<I>, Min>
													: K extends "notnull"
														? ParseInfix<
																T,
																IsTest_<L, "null", true>,
																Nx<I>,
																Min
															>
														: K extends "not"
															? ParseNegated<T, L, Nx<I>, Min, I>
															: K extends "in"
																? ParseIn<T, L, Nx<I>, Min, false>
																: K extends "like"
																	? ParseLike<T, L, Nx<I>, Min, "like", false>
																	: K extends "ilike"
																		? ParseLike<
																				T,
																				L,
																				Nx<I>,
																				Min,
																				"ilike",
																				false
																			>
																		: K extends "similar"
																			? EatWord<T, Nx<I>, "to"> extends never
																				? Ok<L, I>
																				: ParseLike<
																						T,
																						L,
																						EatWord<T, Nx<I>, "to">,
																						Min,
																						"similar",
																						false
																					>
																			: K extends "between"
																				? ParseBetween<T, L, Nx<I>, Min, false>
																				: K extends "at"
																					? ParseAtTimeZone<T, L, Nx<I>, Min>
																					: K extends "collate"
																						? ParseCollate<T, L, Nx<I>, Min>
																						: K extends "operator"
																							? ParseOperatorSyntax<
																									T,
																									L,
																									Nx<I>,
																									Min,
																									I
																								>
																							: K extends "overlaps"
																								? L extends {
																										readonly t: "row";
																										readonly items: infer Ls extends
																											readonly unknown[];
																									}
																									? ParseOverlaps<
																											T,
																											Ls,
																											Nx<I>,
																											Min
																										>
																									: Ok<L, I>
																								: never;

type Indirectable = TagSubFieldIdxSlice;

type NonAssoc<
	T extends Toks,
	L,
	J extends number,
	Min extends MinPrec,
	P extends 4 | 5 | 6,
> = PrecAt<T, J> extends P ? SyntaxErrorAt<T, J> : ParseInfix<T, L, J, Min>;
type PrecAt<T extends Toks, J extends number> =
	T[J] extends OpTok<ComparisonOp>
		? 5
		: T[J] extends WordTok<infer W>
			? W extends "is" | "isnull" | "notnull"
				? 4
				: W extends Prec6Word
					? 6
					: W extends "not"
						? T[Nx<J>] extends WordTok<Prec6Word>
							? 6
							: 0
						: 0
			: 0;
type Prec6Word = "like" | "ilike" | "similar" | "between" | "in";

type IsTest_<E, What extends IsTest["what"], Not extends boolean> = {
	t: "is";
	e: E;
	what: What;
	not: Not;
};

type ParseChain<
	T extends Toks,
	Op extends "and" | "or",
	P extends Prec,
	Items extends readonly unknown[],
	I extends number,
	Min extends MinPrec,
> =
	ParseExpr<T, I, P> extends infer X
		? X extends Ok<infer E, infer J>
			? T[J] extends WordTok<Op>
				? Min extends "target"
					? T[Nx<J>] extends OpTok<",">
						? Ok<Balance<[...Items, E], Op>, J>
						: EndsTargetList<T, Nx<J>> extends true
							? Ok<Balance<[...Items, E], Op>, J>
							: ParseChain<T, Op, P, [...Items, E], Nx<J>, Min>
					: ParseChain<T, Op, P, [...Items, E], Nx<J>, Min>
				: ParseInfix<T, Balance<[...Items, E], Op>, J, Min>
			: X
		: never;
type Balance<
	Items extends readonly unknown[],
	Op extends string,
> = Items extends readonly [infer Only]
	? Only
	: Balance<PairUp<Items, Op, []>, Op>;
type PairUp<
	Items extends readonly unknown[],
	Op extends string,
	Acc extends readonly unknown[],
> = Items extends readonly [infer A, infer B, ...infer Rest]
	? PairUp<Rest, Op, [...Acc, BinNode<Op, A, B>]>
	: [...Acc, ...Items];

type BinRhs<
	T extends Toks,
	L,
	O extends string,
	Bp extends Prec,
	I0 extends number,
	I extends number,
	Min extends MinPrec,
> =
	Binds<Bp, Min> extends true
		? T[I] extends WordTok<infer Q extends "any" | "some" | "all">
			? T[Nx<I>] extends OpTok<"(">
				? ParseQuantified<T, L, O, Q extends "all" ? "all" : "any", Nx2<I>, Min>
				: SyntaxErrorAt<T, Nx<I>>
			: ParseExpr<T, I, NextPrec[Bp]> extends infer X
				? X extends Ok<infer Rhs, infer J>
					? ParseInfix<T, BinNode<O, L, Rhs>, J, Min>
					: X
				: never
		: Ok<L, I0>;

type ParseComparisonRhs<
	T extends Toks,
	L,
	O extends string,
	I extends number,
	Min extends MinPrec,
> =
	T[I] extends WordTok<infer Q extends "any" | "some" | "all">
		? T[Nx<I>] extends OpTok<"(">
			? ParseQuantified<
					T,
					L,
					O,
					Q extends "all" ? "all" : "any",
					Nx<Nx<I>>,
					Min
				>
			: SyntaxErrorAt<T, Nx<I>>
		: ParseExpr<T, I, 6> extends infer X
			? X extends Ok<infer Rhs, infer J>
				? NonAssoc<T, BinNode<O, L, Rhs>, J, Min, 5>
				: X
			: never;

type ParseQuantified<
	T extends Toks,
	L,
	O extends string,
	Q extends "any" | "all",
	I extends number,
	Min extends MinPrec,
> =
	ParseSelectStmt<T, I> extends Ok<infer S, infer J>
		? EatOp<T, J, ")"> extends never
			? ParseQuantifiedExpr<T, L, O, Q, I, Min>
			: ParseInfix<T, QuantNode<L, O, Q, S>, EatOp<T, J, ")">, Min>
		: ParseQuantifiedExpr<T, L, O, Q, I, Min>;
type ParseQuantifiedExpr<
	T extends Toks,
	L,
	O extends string,
	Q extends "any" | "all",
	I extends number,
	Min extends MinPrec,
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer A, infer J>
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: ParseInfix<T, QuantNode<L, O, Q, A>, EatOp<T, J, ")">, Min>
			: X
		: never;

type ParseCastSuffix<T extends Toks, L, I extends number, Min extends MinPrec> =
	ParseTypeName<T, I> extends infer X
		? X extends Ok<infer Ty, infer J>
			? ParseInfix<T, CastNode<L, Ty>, J, Min>
			: X
		: never;

type ParseSubscript<T extends Toks, L, I extends number, Min extends MinPrec> =
	EatOp<T, I, ":"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer Ix, infer J>
				? EatOp<T, J, "]"> extends never
					? EatOp<T, J, ":"> extends never
						? Expected<'"]"', T, J>
						: ParseSliceHi<T, L, Ix, EatOp<T, J, ":">, Min>
					: ParseInfix<T, IdxNode<L, Ix>, EatOp<T, J, "]">, Min>
				: X
			: never
		: ParseSliceHi<T, L, null, EatOp<T, I, ":">, Min>;
type ParseSliceHi<
	T extends Toks,
	L,
	Lo,
	I extends number,
	Min extends MinPrec,
> =
	EatOp<T, I, "]"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer Hi, infer J>
				? EatOp<T, J, "]"> extends never
					? Expected<'"]"', T, J>
					: ParseInfix<T, SliceNode<L, Lo, Hi>, EatOp<T, J, "]">, Min>
				: X
			: never
		: ParseInfix<T, SliceNode<L, Lo, null>, EatOp<T, I, "]">, Min>;

type ParseFieldAccess<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
> =
	T[I] extends OpTok<"*">
		? ParseInfix<T, FieldNode<L, "*">, Nx<I>, Min>
		: AnyLabel<T, I> extends [infer N, infer J extends number]
			? ParseInfix<T, FieldNode<L, N>, J, Min>
			: Expected<"field name", T, I>;

type ParseIs<T extends Toks, L, I extends number, Min extends MinPrec> =
	EatWord<T, I, "not"> extends never
		? ParseIsBody<T, L, I, Min, false>
		: ParseIsBody<T, L, EatWord<T, I, "not">, Min, true>;
type ParseIsBody<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	T[I] extends WordTok<infer W>
		? W extends "null" | "true" | "false" | "unknown"
			? ParseInfix<T, IsTest_<L, W, Not>, Nx<I>, Min>
			: W extends "document"
				? ParseInfix<T, XmlIsDocument<L, Not>, Nx<I>, Min>
				: W extends "json"
					? ParseInfix<
							T,
							IsJsonNode<L, Not>,
							SkipUniqueKeys<
								T,
								SkipWord<T, Nx<I>, "value" | "scalar" | "array" | "object">
							>,
							Min
						>
					: W extends "normalized"
						? ParseInfix<
								T,
								NotIf<CallOf<"is_normalized", [L]>, Not>,
								Nx<I>,
								Min
							>
						: W extends "nfc" | "nfd" | "nfkc" | "nfkd"
							? T[Nx<I>] extends WordTok<"normalized">
								? ParseInfix<
										T,
										NotIf<
											CallOf<"is_normalized", [L, StrNode<Uppercase<W>>]>,
											Not
										>,
										Nx2<I>,
										Min
									>
								: Expected<"NORMALIZED", T, Nx<I>>
							: W extends "distinct"
								? EatWord<T, Nx<I>, "from"> extends never
									? Expected<"FROM", T, Nx<I>>
									: ParseExpr<T, EatWord<T, Nx<I>, "from">, 5> extends infer X
										? X extends Ok<infer Rhs, infer J>
											? NonAssoc<T, DistinctNode<L, Rhs, Not>, J, Min, 4>
											: X
										: never
								: Expected<
										"NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED",
										T,
										I
									>
		: Expected<"NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED", T, I>;
type NotIf<E, Not extends boolean> = Not extends true ? UnNode<"not", E> : E;

type ParseNegated<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	I0 extends number,
> =
	T[I] extends WordTok<infer W>
		? W extends "in"
			? ParseIn<T, L, Nx<I>, Min, true>
			: W extends "like" | "ilike"
				? ParseLike<T, L, Nx<I>, Min, W, true>
				: W extends "similar"
					? EatWord<T, Nx<I>, "to"> extends never
						? Expected<"TO", T, Nx<I>>
						: ParseLike<T, L, EatWord<T, Nx<I>, "to">, Min, "similar", true>
					: W extends "between"
						? ParseBetween<T, L, Nx<I>, Min, true>
						: Ok<L, I0>
		: Ok<L, I0>;

type ParseIn<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: IsSelectStart<T, EatOp<T, I, "(">> extends true
			? ParseSelectStmt<T, EatOp<T, I, "(">> extends infer X
				? X extends Ok<infer S, infer J>
					? EatOp<T, J, ")"> extends never
						? T[EatOp<T, I, "(">] extends OpTok<"(">
							? ParseInList<T, L, EatOp<T, I, "(">, Min, Not>
							: Expected<'")"', T, J>
						: ParseInfix<T, InSubNode<L, S, Not>, EatOp<T, J, ")">, Min>
					: X
				: never
			: ParseInList<T, L, EatOp<T, I, "(">, Min, Not>;
type ParseInList<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	ParseExprList<T, I, []> extends infer X
		? X extends Ok<infer List, infer J>
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: ParseInfix<T, InNode<L, List, Not>, EatOp<T, J, ")">, Min>
			: X
		: never;

type ParseLike<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Kind extends "like" | "ilike" | "similar",
	Not extends boolean,
> =
	T[I] extends WordTok<infer Q extends "any" | "some" | "all">
		? Kind extends "similar"
			? SyntaxErrorAt<T, I>
			: T[Nx<I>] extends OpTok<"(">
				? ParseQuantified<
						T,
						L,
						LikeOp<Kind, Not>,
						Q extends "all" ? "all" : "any",
						Nx2<I>,
						Min
					>
				: SyntaxErrorAt<T, Nx<I>>
		: ParseExpr<T, I, 7> extends infer X
			? X extends Ok<infer Pat, infer J>
				? EatWord<T, J, "escape"> extends never
					? NonAssoc<T, LikeNode<L, Pat, Kind, Not>, J, Min, 6>
					: ParseExpr<T, EatWord<T, J, "escape">, 7> extends infer Y
						? Y extends Ok<unknown, infer J2>
							? NonAssoc<T, LikeNode<L, Pat, Kind, Not>, J2, Min, 6>
							: Y
						: never
				: X
			: never;

type LikeOp<Kind extends string, Not extends boolean> = Kind extends "ilike"
	? Not extends true
		? "!~~*"
		: "~~*"
	: Not extends true
		? "!~~"
		: "~~";

type ParseBetween<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	ParseExpr<T, SkipWord<T, I, "symmetric" | "asymmetric">, 7> extends infer X
		? X extends Ok<infer Lo, infer J>
			? EatWord<T, J, "and"> extends never
				? Expected<"AND", T, J>
				: ParseExpr<T, EatWord<T, J, "and">, 7> extends infer Y
					? Y extends Ok<infer Hi, infer J2>
						? NonAssoc<T, BetweenNode<L, Lo, Hi, Not>, J2, Min, 6>
						: Y
					: never
			: X
		: never;

type ParseAtTimeZone<T extends Toks, L, I extends number, Min extends MinPrec> =
	T[I] extends WordTok<"local">
		? ParseInfix<T, CallOf<"timezone", [L]>, Nx<I>, Min>
		: EatWords<T, I, ["time", "zone"]> extends never
			? Expected<"TIME ZONE or LOCAL", T, I>
			: ParseExpr<T, EatWords<T, I, ["time", "zone"]>, 11> extends infer X
				? X extends Ok<infer Z, infer J>
					? ParseInfix<T, AtTzNode<L, Z>, J, Min>
					: X
				: never;

type ParseCollate<T extends Toks, L, I extends number, Min extends MinPrec> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseInfix<T, CollateNode<L, LastOf<Parts>>, J, Min>
		: Expected<"collation name", T, I>;

type ParseOverlaps<
	T extends Toks,
	Ls extends readonly unknown[],
	I extends number,
	Min extends MinPrec,
> = Ls extends readonly [infer A, infer B]
	? ParsePrefix<T, I> extends infer X
		? X extends Ok<infer R, infer J>
			? R extends {
					readonly t: "row";
					readonly items: readonly [infer C, infer D];
				}
				? ParseInfix<T, CallOf<"overlaps", [A, B, C, D]>, J, Min>
				: R extends TagRow
					? Fail<
							"wrong number of parameters on right side of OVERLAPS expression",
							I
						>
					: SyntaxErrorAt<T, I>
			: X
		: never
	: Fail<"wrong number of parameters on left side of OVERLAPS expression", I>;
type CallOf<Name extends string, Args> = CallNode<
	Name,
	Args,
	false,
	null,
	false,
	null,
	null
>;

type ParseOperatorSyntax<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	I0 extends number,
> =
	T[I] extends OpTok<"(">
		? QualOp<T, Nx<I>> extends [infer O extends string, infer J extends number]
			? BinRhs<T, L, O, 7, I0, J, Min>
			: SyntaxErrorAt<T, Extract<QualOp<T, Nx<I>>, number>>
		: Ok<L, I0>;
type QualOp<T extends Toks, I extends number> =
	T[I] extends OpTok<infer O>
		? T[Nx<I>] extends OpTok<")">
			? [O, Nx2<I>]
			: Nx<I>
		: T[Nx<I>] extends OpTok<".">
			? QualOp<T, Nx2<I>>
			: Nx<I>;
type ParseQualPrefix<T extends Toks, I extends number> =
	QualOp<T, I> extends [infer O, infer J extends number]
		? ParseExpr<T, J, 8> extends infer X
			? X extends Ok<infer E, infer J2>
				? Ok<UnNode<O, E>, J2>
				: X
			: never
		: SyntaxErrorAt<T, Extract<QualOp<T, I>, number>>;

type PrefixKeyword =
	| ReservedKeyword
	| XmlFuncKeyword
	| ConstTypeWord
	| SpecialValueFunction
	| "null"
	| "true"
	| "false"
	| "default"
	| "not"
	| "case"
	| "cast"
	| "exists"
	| "array"
	| "row"
	| "extract"
	| "position"
	| "substring"
	| "trim"
	| "overlay"
	| "operator"
	| "collation"
	| "normalize";

type ParsePrefix<T extends Toks, I extends number> =
	T[I] extends NumTok<infer V>
		? Ok<NumNode<V>, Nx<I>>
		: T[I] extends StrTok<infer V>
			? T[I] extends { readonly bits: true }
				? Ok<{ t: "typed"; type: "bit"; v: V; bits: true }, Nx<I>>
				: Ok<StrNode<V>, Nx<I>>
			: T[I] extends ParamTok<infer N>
				? Ok<ParamNode<N>, Nx<I>>
				: T[I] extends OpTok<infer O>
					? O extends "("
						? ParseParen<T, Nx<I>>
						: O extends "*"
							? Ok<StarNode<null>, Nx<I>>
							: O extends "["
								? ParseArrayLiteral<T, Nx<I>>
								: O extends NotPrefixOp
									? SyntaxErrorAt<T, I>
									: ParseUnary<T, O, Nx<I>>
					: T[I] extends IdTok
						? ParseNameExpr<T, I>
						: T[I] extends WordTok<infer W>
							? W extends PrefixKeyword
								? W extends "null"
									? Ok<{ t: "null" }, Nx<I>>
									: W extends "true"
										? Ok<BoolNode<true>, Nx<I>>
										: W extends "false"
											? Ok<BoolNode<false>, Nx<I>>
											: W extends "default"
												? Ok<{ t: "default" }, Nx<I>>
												: W extends "not"
													? ParseUnary<T, "not", Nx<I>>
													: W extends "case"
														? ParseCase<T, Nx<I>>
														: W extends "cast"
															? ParseCast<T, Nx<I>>
															: W extends "exists"
																? EatOp<T, Nx<I>, "("> extends never
																	? ParseNameExpr<T, I>
																	: ParseExists<T, EatOp<T, Nx<I>, "(">>
																: W extends "array"
																	? ParseArray<T, Nx<I>>
																	: W extends "row"
																		? EatOp<T, Nx<I>, "("> extends never
																			? ParseNameExpr<T, I>
																			: ParseRow<T, EatOp<T, Nx<I>, "(">>
																		: W extends "extract"
																			? EatOp<T, Nx<I>, "("> extends never
																				? ParseNameExpr<T, I>
																				: ParseExtract<T, EatOp<T, Nx<I>, "(">>
																			: W extends "position"
																				? EatOp<T, Nx<I>, "("> extends never
																					? ParseNameExpr<T, I>
																					: ParsePosition<
																							T,
																							EatOp<T, Nx<I>, "(">
																						>
																				: W extends "substring"
																					? EatOp<T, Nx<I>, "("> extends never
																						? ParseNameExpr<T, I>
																						: ParseSubstring<
																								T,
																								EatOp<T, Nx<I>, "(">
																							>
																					: W extends "trim"
																						? EatOp<T, Nx<I>, "("> extends never
																							? ParseNameExpr<T, I>
																							: ParseTrim<
																									T,
																									EatOp<T, Nx<I>, "(">
																								>
																						: W extends "overlay"
																							? EatOp<
																									T,
																									Nx<I>,
																									"("
																								> extends never
																								? ParseNameExpr<T, I>
																								: ParseOverlay<
																										T,
																										EatOp<T, Nx<I>, "(">
																									>
																							: W extends SpecialValueFunction
																								? ParseSpecialValue<T, W, I>
																								: W extends "operator"
																									? T[Nx<I>] extends OpTok<"(">
																										? ParseQualPrefix<T, Nx2<I>>
																										: ParseNameExpr<T, I>
																									: W extends XmlFuncKeyword
																										? T[Nx<I>] extends OpTok<"(">
																											? ParseXmlFunc<
																													T,
																													W,
																													Nx<Nx<I>>
																												>
																											: ParseNameExpr<T, I>
																										: W extends ConstTypeWord
																											? ParseConstTypeLit<T, I>
																											: W extends "collation"
																												? T[Nx<I>] extends WordTok<"for">
																													? ParseCollationFor<
																															T,
																															Nx2<I>
																														>
																													: ParseNameExpr<T, I>
																												: W extends "normalize"
																													? T[Nx<I>] extends OpTok<"(">
																														? ParseNormalize<
																																T,
																																Nx2<I>
																															>
																														: ParseNameExpr<
																																T,
																																I
																															>
																													: W extends ReservedKeyword
																														? SyntaxErrorAt<
																																T,
																																I
																															>
																														: ParseNameExpr<
																																T,
																																I
																															>
								: ParseNameExpr<T, I>
							: Fail<"syntax error at end of input", I>;

type ConstTypeWord =
	| "timestamp"
	| "time"
	| "interval"
	| "char"
	| "character"
	| "nchar"
	| "national"
	| "varchar"
	| "bit"
	| "double"
	| "dec"
	| "decimal"
	| "numeric"
	| "float";
type ParseConstTypeLit<T extends Toks, I extends number> =
	ParseTypeName<T, I> extends Ok<infer Ty, infer J>
		? T[J] extends StrTok<infer V>
			? Ty extends `${string}[]`
				? ParseNameExpr<T, I>
				: Ty extends "interval"
					? ParseIntervalLit<T, I, V, J>
					: Ok<TypedNode<Ty, V>, Nx<J>>
			: ParseNameExpr<T, I>
		: ParseNameExpr<T, I>;

type ParseIntervalLit<T extends Toks, I extends number, V, J extends number> =
	T[Nx<I>] extends OpTok<"(">
		? Ok<TypedNode<"interval", V>, Nx<J>>
		: Nx<I> extends J
			? IntervalFields<T, Nx<J>> extends infer K
				? K extends number
					? Ok<TypedNode<"interval", V>, K>
					: K
				: never
			: SyntaxErrorAt<T, Nx<I>>;

type ParseCollationFor<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExpr<T, EatOp<T, I, "(">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<CallOf<"pg_collation_for", [E]>, EatOp<T, J, ")">>
				: X
			: never;

type ParseNormalize<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? T[J] extends OpTok<")">
				? Ok<CallOf<"normalize", [E]>, Nx<J>>
				: T[J] extends OpTok<",">
					? T[Nx<J>] extends WordTok<
							infer F extends "nfc" | "nfd" | "nfkc" | "nfkd"
						>
						? T[Nx2<J>] extends OpTok<")">
							? Ok<CallOf<"normalize", [E, StrNode<Uppercase<F>>]>, Nx3<J>>
							: Expected<'")"', T, Nx2<J>>
						: Expected<"NFC, NFD, NFKC or NFKD", T, Nx<J>>
					: Expected<'")"', T, J>
			: X
		: never;

type SpecialValueFunction =
	| "current_date"
	| "current_timestamp"
	| "current_time"
	| "localtime"
	| "localtimestamp"
	| "current_user"
	| "current_role"
	| "session_user"
	| "current_catalog"
	| "current_schema"
	| "user"
	| "system_user";

type PrecisionValueFunction =
	| "current_timestamp"
	| "current_time"
	| "localtime"
	| "localtimestamp";

type ParseSpecialValue<T extends Toks, W extends string, I extends number> =
	T[Nx<I>] extends OpTok<"(">
		? W extends "current_schema"
			? ParseNameExpr<T, I>
			: W extends PrecisionValueFunction
				? ParsePrecision<T, Nx2<I>> extends infer J
					? J extends number
						? SpecialValue<W, J>
						: J
					: never
				: SyntaxErrorAt<T, Nx<I>>
		: SpecialValue<W, Nx<I>>;

type SpecialValue<W extends string, J extends number> = Ok<
	CallNode<W, [], false, null, false, null, null>,
	J
>;

type ParseUnary<T extends Toks, O extends string, I extends number> =
	ParseExpr<
		T,
		I,
		O extends "not" ? 3 : O extends "-" | "+" ? 11 : 8
	> extends infer X
		? X extends Ok<infer E, infer J>
			? Ok<UnNode<O, E>, J>
			: X
		: never;

type ParseParen<T extends Toks, I extends number> =
	IsSelectStart<T, I> extends true
		? ParseSelectStmt<T, I> extends infer X
			? X extends Ok<infer S, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<SubNode<S>, EatOp<T, J, ")">>
				: X
			: never
		: ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatOp<T, J, ")"> extends never
					? EatOp<T, J, ","> extends never
						? Expected<'")"', T, J>
						: ParseExprList<T, EatOp<T, J, ",">, [E]> extends infer Y
							? Y extends Ok<infer Items, infer J2>
								? EatOp<T, J2, ")"> extends never
									? Expected<'")"', T, J2>
									: Ok<RowNode<Items>, EatOp<T, J2, ")">>
								: Y
							: never
					: T[EatOp<T, J, ")">] extends OpTok<".">
						? ParseParenField<T, E, Nx<EatOp<T, J, ")">>>
						: T[EatOp<T, J, ")">] extends OpTok<"[">
							? ParseSubscript<T, E, Nx<EatOp<T, J, ")">>, 13>
							: Ok<E, EatOp<T, J, ")">>
				: X
			: never;
type ParseParenField<T extends Toks, E, I extends number> =
	T[I] extends OpTok<"*">
		? Ok<FieldNode<E, "*">, Nx<I>>
		: AnyLabel<T, I> extends [infer N, infer J extends number]
			? Ok<FieldNode<E, N>, J>
			: Expected<"field name", T, I>;

type ColumnPrefix<H, A, B, C> = H extends IdTok<infer N> | WordTok<infer N>
	? H extends WordTok<NotColId>
		? null
		: A extends OpTok<".">
			? B extends IdTok<infer Name> | WordTok<infer Name>
				? C extends OpTok<"." | "("> | StrTok
					? null
					: [ColNode<N, Name>, 3]
				: null
			: A extends OpTok<"("> | StrTok
				? null
				: [ColNode<null, N>, 1]
	: null;

type ParseNameExpr<T extends Toks, I extends number> =
	ColumnPrefix<T[I], T[Nx<I>], T[Nx2<I>], T[Nx3<I>]> extends infer R
		? R extends [infer E, infer N]
			? Ok<E, N extends 1 ? Nx<I> : Nx3<I>>
			: ParseNameExprSlow<T, I>
		: never;

type ParseNameExprSlow<T extends Toks, I extends number> =
	FuncName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? T[I] extends WordTok<infer W extends JsonFuncWord>
				? T[Nx<I>] extends OpTok<"(">
					? ParseJsonFunc<T, W, I>
					: ParseCall<T, LastOf<Parts>, Nx<J>>
				: ParseCall<T, LastOf<Parts>, Nx<J>>
			: T[J] extends OpTok<".">
				? T[Nx<J>] extends OpTok<"*">
					? Ok<StarNode<LastOf<Parts>>, Nx<Nx<J>>>
					: SyntaxErrorAt<T, Nx<J>>
				: T[J] extends StrTok<infer V>
					? Parts["length"] extends 1 | 2
						? Ok<TypedNode<NormalizeTypeName<LastOf<Parts>>, V>, Nx<J>>
						: SyntaxErrorAt<T, J>
					: Ok<ColRefOf<Parts>, J>
		: SyntaxErrorAt<T, Nx<I>>;

type LastOf<Parts extends readonly string[]> = Parts extends readonly [
	...string[],
	infer L,
]
	? L
	: never;
type ColRefOf<Parts extends readonly string[]> = Parts extends readonly [
	infer C,
]
	? ColNode<null, C>
	: Parts extends readonly [infer Tb, infer C]
		? ColNode<Tb, C>
		: Parts extends readonly [string, infer Tb, infer C]
			? ColNode<Tb, C>
			: never;

export type ParseCall<T extends Toks, Name extends string, I extends number> =
	T[I] extends OpTok<")">
		? ParseCallSuffix<T, Name, [], false, Nx<I>>
		: T[I] extends OpTok<"*">
			? T[Nx<I>] extends OpTok<")">
				? ParseCallSuffix<T, Name, [StarNode<null>], false, Nx<Nx<I>>>
				: SyntaxErrorAt<T, Nx<I>>
			: EatWord<T, I, "distinct"> extends never
				? ParseCallArgs<T, Name, SkipWord<T, I, "all">, false>
				: ParseCallArgs<T, Name, EatWord<T, I, "distinct">, true>;

type ParseCallArgs<
	T extends Toks,
	Name extends string,
	I extends number,
	Distinct extends boolean,
> =
	ParseArgList<T, I, [], never> extends infer X
		? X extends Ok<infer Args, infer J>
			? SkipAggOrderBy<T, J> extends infer J2
				? J2 extends number
					? EatOp<T, J2, ")"> extends never
						? Expected<'")"', T, J2>
						: ParseCallSuffix<T, Name, Args, Distinct, EatOp<T, J2, ")">>
					: J2
				: never
			: X
		: never;

type ParseArgList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Names extends string,
> =
	T[I] extends WordTok<"variadic">
		? ParseArg<T, Nx<I>, Names> extends infer X
			? X extends Ok<infer E, infer J>
				? Ok<[...Acc, VariadicNode<E>], J>
				: X
			: never
		: ParseArg<T, I, Names> extends infer X
			? X extends Ok<infer E, infer J>
				? EatOp<T, J, ","> extends never
					? Ok<[...Acc, E], J>
					: ParseArgList<
							T,
							EatOp<T, J, ",">,
							[...Acc, E],
							| Names
							| (E extends {
									readonly t: "named";
									readonly name: infer N extends string;
							  }
									? N
									: never)
						>
				: X
			: never;
type ParseArg<T extends Toks, I extends number, Names extends string> =
	T[Nx<I>] extends OpTok<"=>" | ":=">
		? ArgName<T, I> extends infer N extends string
			? N extends Names
				? Fail<`argument name "${N}" used more than once`, I>
				: ParseExpr<T, Nx2<I>, 0> extends infer X
					? X extends Ok<infer E, infer J>
						? Ok<NamedNode<N, E>, J>
						: X
					: never
			: T[I] extends WordTok<ReservedKeyword>
				? SyntaxErrorAt<T, I>
				: SyntaxErrorAt<T, Nx<I>>
		: [Names] extends [never]
			? ParseExpr<T, I, 0>
			: ParseExpr<T, I, 0> extends infer X
				? X extends Ok<unknown, number>
					? Fail<"positional argument cannot follow named argument", I>
					: X
				: never;
type ArgName<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? V
		: T[I] extends WordTok<infer V>
			? V extends NotTypeFuncName
				? null
				: V
			: null;

type SkipAggOrderBy<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? I
		: ParseOrderList<T, EatWords<T, I, ["order", "by"]>> extends infer X
			? X extends Ok<unknown, infer J>
				? J
				: X
			: never;

type ParseCallSuffix<
	T extends Toks,
	Name extends string,
	Args,
	Distinct extends boolean,
	I extends number,
> =
	T[I] extends WordTok<"within" | "filter" | "over">
		? ParseCallDecorations<T, Name, Args, Distinct, I>
		: Ok<CallNode<Name, Args, Distinct, null, false, null, null>, I>;

type ParseCallDecorations<
	T extends Toks,
	Name extends string,
	Args,
	Distinct extends boolean,
	I extends number,
> =
	ParseWithinGroup<T, I> extends infer W
		? W extends Ok<infer WG, infer I1>
			? ParseFilter<T, I1> extends infer F
				? F extends Ok<infer Flt, infer I2>
					? ParseOver<T, I2> extends infer O
						? O extends Ok<infer Ov, infer I3>
							? Ok<
									CallNode<
										Name,
										Args,
										Distinct,
										Flt,
										Ov extends null ? false : true,
										Ov,
										WG
									>,
									I3
								>
							: O
						: never
					: F
				: never
			: W
		: never;

type ParseWithinGroup<T extends Toks, I extends number> =
	EatWords<T, I, ["within", "group"]> extends never
		? Ok<null, I>
		: EatOp<T, EatWords<T, I, ["within", "group"]>, "("> extends never
			? Expected<'"("', T, EatWords<T, I, ["within", "group"]>>
			: EatWords<
						T,
						EatOp<T, EatWords<T, I, ["within", "group"]>, "(">,
						["order", "by"]
					> extends never
				? Expected<
						"ORDER BY",
						T,
						EatOp<T, EatWords<T, I, ["within", "group"]>, "(">
					>
				: ParseOrderList<
							T,
							EatWords<
								T,
								EatOp<T, EatWords<T, I, ["within", "group"]>, "(">,
								["order", "by"]
							>
						> extends infer X
					? X extends Ok<infer Es, infer J>
						? EatOp<T, J, ")"> extends never
							? Expected<'")"', T, J>
							: Ok<
									Es extends readonly [infer E] ? E : RowNode<Es>,
									EatOp<T, J, ")">
								>
						: X
					: never;

export type ParseFilter<T extends Toks, I extends number> =
	EatWord<T, I, "filter"> extends never
		? Ok<null, I>
		: EatOp<T, EatWord<T, I, "filter">, "("> extends never
			? Expected<'"("', T, EatWord<T, I, "filter">>
			: EatWord<
						T,
						EatOp<T, EatWord<T, I, "filter">, "(">,
						"where"
					> extends never
				? Expected<"WHERE", T, EatOp<T, EatWord<T, I, "filter">, "(">>
				: ParseExpr<
							T,
							EatWord<T, EatOp<T, EatWord<T, I, "filter">, "(">, "where">,
							0
						> extends infer X
					? X extends Ok<infer E, infer J>
						? EatOp<T, J, ")"> extends never
							? Expected<'")"', T, J>
							: Ok<E, EatOp<T, J, ")">>
						: X
					: never;

export type ParseOver<T extends Toks, I extends number> =
	EatWord<T, I, "over"> extends never
		? Ok<null, I>
		: T[EatWord<T, I, "over">] extends OpTok<"(">
			? ParseWindowSpec<T, Nx<EatWord<T, I, "over">>>
			: T[EatWord<T, I, "over">] extends WordTok<infer W> | IdTok<infer W>
				? Ok<{ name: W; partition: []; order: [] }, Nx<EatWord<T, I, "over">>>
				: Expected<"window specification", T, EatWord<T, I, "over">>;

export type ParseWindowSpec<T extends Toks, I extends number> =
	WindowBaseName<T, I> extends [infer Name, infer I1 extends number]
		? ParseWindowPartition<T, I1> extends infer P
			? P extends Ok<infer Part, infer I2>
				? ParseWindowOrder<T, I2> extends infer O
					? O extends Ok<infer Ord, infer I3>
						? ParseFrame<T, I3> extends infer F
							? F extends Ok<infer Kinds, infer I4>
								? FrameOrderError<
										T[I3],
										Kinds,
										Name,
										Ord
									> extends infer M extends string
									? Fail<M, I3>
									: EatOp<T, I4, ")"> extends never
										? Expected<'")"', T, I4>
										: Ok<
												{ name: Name; partition: Part; order: Ord },
												EatOp<T, I4, ")">
											>
								: F
							: never
						: O
					: never
				: P
			: never
		: never;
type WindowBaseName<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? [V, Nx<I>]
		: T[I] extends WordTok<infer W>
			? W extends "partition" | "order" | "rows" | "range" | "groups"
				? [null, I]
				: [W, Nx<I>]
			: [null, I];
type ParseWindowPartition<T extends Toks, I extends number> =
	EatWords<T, I, ["partition", "by"]> extends never
		? Ok<[], I>
		: ParseExprList<T, EatWords<T, I, ["partition", "by"]>, []>;
type ParseWindowOrder<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? Ok<[], I>
		: ParseOrderList<T, EatWords<T, I, ["order", "by"]>>;
type ParseFrame<T extends Toks, I extends number> =
	EatWord<T, I, "rows" | "range" | "groups"> extends never
		? Ok<never, I>
		: EatWord<T, Nx<I>, "between"> extends never
			? ParseFrameBound<T, Nx<I>> extends infer B
				? B extends readonly [infer S, infer J extends number]
					? S extends "unbounded following"
						? Fail<"frame start cannot be UNBOUNDED FOLLOWING", I>
						: S extends "following"
							? Fail<
									"frame starting from following row cannot end with current row",
									I
								>
							: FrameExclusion<T, S, J>
					: B
				: never
			: ParseFrameBound<T, Nx2<I>> extends infer B
				? B extends readonly [infer S, infer J extends number]
					? EatWord<T, J, "and"> extends never
						? Expected<"AND", T, J>
						: ParseFrameBound<T, Nx<J>> extends infer B2
							? B2 extends readonly [infer E, infer J2 extends number]
								? FrameError<S, E> extends infer M extends string
									? Fail<M, I>
									: FrameExclusion<T, S | E, J2>
								: B2
							: never
					: B
				: never;
type FrameExclusion<T extends Toks, Kinds, I extends number> =
	SkipExclude<T, I> extends infer J
		? J extends number
			? Ok<Kinds, J>
			: J
		: never;
type FrameOrderError<Mode, Kinds, Name, Ord> = [Name, Ord] extends [
	null,
	readonly [],
]
	? Mode extends WordTok<"groups">
		? "GROUPS mode requires an ORDER BY clause"
		: Mode extends WordTok<"range">
			? [Extract<Kinds, "preceding" | "following">] extends [never]
				? null
				: "RANGE with offset PRECEDING/FOLLOWING requires exactly one ORDER BY column"
			: null
	: null;
type FrameError<S, E> = S extends "unbounded following"
	? "frame start cannot be UNBOUNDED FOLLOWING"
	: E extends "unbounded preceding"
		? "frame end cannot be UNBOUNDED PRECEDING"
		: S extends "current row"
			? E extends "preceding"
				? "frame starting from current row cannot have preceding rows"
				: null
			: S extends "following"
				? E extends "preceding" | "current row"
					? "frame starting from following row cannot have preceding rows"
					: null
				: null;
type ParseFrameBound<T extends Toks, I extends number> =
	EatWords<T, I, ["unbounded", "preceding"]> extends never
		? EatWords<T, I, ["unbounded", "following"]> extends never
			? EatWords<T, I, ["current", "row"]> extends never
				? ParseExpr<T, I, 0> extends infer X
					? X extends Ok<unknown, infer J>
						? T[J] extends WordTok<infer D extends "preceding" | "following">
							? [D, Nx<J>]
							: Expected<"PRECEDING or FOLLOWING", T, J>
						: X
					: never
				: ["current row", Nx2<I>]
			: ["unbounded following", Nx2<I>]
		: ["unbounded preceding", Nx2<I>];
type SkipExclude<T extends Toks, I extends number> =
	EatWord<T, I, "exclude"> extends never
		? I
		: EatWords<T, EatWord<T, I, "exclude">, ["current", "row"]> extends never
			? EatWords<T, EatWord<T, I, "exclude">, ["no", "others"]> extends never
				? EatWord<T, EatWord<T, I, "exclude">, "group" | "ties"> extends never
					? Expected<
							"CURRENT ROW, GROUP, TIES or NO OTHERS",
							T,
							EatWord<T, I, "exclude">
						>
					: EatWord<T, EatWord<T, I, "exclude">, "group" | "ties">
				: EatWords<T, EatWord<T, I, "exclude">, ["no", "others"]>
			: EatWords<T, EatWord<T, I, "exclude">, ["current", "row"]>;

type ParseCase<T extends Toks, I extends number> =
	EatWord<T, I, "when"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer Operand, infer J>
				? ParseCaseWhens<T, Operand, J, []>
				: X
			: never
		: ParseCaseWhens<T, null, I, []>;
type ParseCaseWhens<
	T extends Toks,
	Operand,
	I extends number,
	Acc extends readonly unknown[],
> =
	EatWord<T, I, "when"> extends never
		? EatWord<T, I, "else"> extends never
			? EatWord<T, I, "end"> extends never
				? Expected<"WHEN, ELSE or END", T, I>
				: Ok<CaseNode<Operand, Acc, null>, EatWord<T, I, "end">>
			: ParseExpr<T, EatWord<T, I, "else">, 0> extends infer X
				? X extends Ok<infer E, infer J>
					? EatWord<T, J, "end"> extends never
						? Expected<"END", T, J>
						: Ok<CaseNode<Operand, Acc, E>, EatWord<T, J, "end">>
					: X
				: never
		: ParseExpr<T, EatWord<T, I, "when">, 0> extends infer X
			? X extends Ok<infer W, infer J>
				? EatWord<T, J, "then"> extends never
					? Expected<"THEN", T, J>
					: ParseExpr<T, EatWord<T, J, "then">, 0> extends infer Y
						? Y extends Ok<infer Th, infer J2>
							? ParseCaseWhens<T, Operand, J2, [...Acc, { when: W; then: Th }]>
							: Y
						: never
				: X
			: never;

type ParseCast<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExpr<T, EatOp<T, I, "(">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatWord<T, J, "as"> extends never
					? Expected<"AS", T, J>
					: ParseTypeName<T, EatWord<T, J, "as">> extends infer Y
						? Y extends Ok<infer Ty, infer J2>
							? EatOp<T, J2, ")"> extends never
								? Expected<'")"', T, J2>
								: Ok<CastNode<E, Ty>, EatOp<T, J2, ")">>
							: Y
						: never
				: X
			: never;

type ParseExists<T extends Toks, I extends number> =
	ParseSelectStmt<T, I> extends infer X
		? X extends Ok<infer S, infer J>
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: Ok<ExistsNode<S>, EatOp<T, J, ")">>
			: X
		: never;

type ParseArray<T extends Toks, I extends number> =
	EatOp<T, I, "["> extends never
		? EatOp<T, I, "("> extends never
			? Expected<'"[" or "("', T, I>
			: ParseSelectStmt<T, EatOp<T, I, "(">> extends infer X
				? X extends Ok<infer S, infer J>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: Ok<ArraySubNode<S>, EatOp<T, J, ")">>
					: X
				: never
		: ParseArrayLiteral<T, EatOp<T, I, "[">>;
type ParseArrayLiteral<T extends Toks, I extends number> =
	EatOp<T, I, "]"> extends never
		? ParseExprList<T, I, []> extends infer X
			? X extends Ok<infer Items, infer J>
				? EatOp<T, J, "]"> extends never
					? Expected<'"]"', T, J>
					: Ok<ArrayNode<Items>, EatOp<T, J, "]">>
				: X
			: never
		: Ok<ArrayNode<[]>, EatOp<T, I, "]">>;

type ParseRow<T extends Toks, I extends number> =
	EatOp<T, I, ")"> extends never
		? ParseExprList<T, I, []> extends infer X
			? X extends Ok<infer Items, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<RowNode<Items>, EatOp<T, J, ")">>
				: X
			: never
		: Ok<RowNode<[]>, EatOp<T, I, ")">>;

type ParseExtract<T extends Toks, I extends number> = T[I] extends
	| WordTok<infer F>
	| StrTok<infer F>
	? EatWord<T, Nx<I>, "from"> extends never
		? Expected<"FROM", T, Nx<I>>
		: ParseExpr<T, EatWord<T, Nx<I>, "from">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<ExtractNode<F, E>, EatOp<T, J, ")">>
				: X
			: never
	: Expected<"field FROM expression", T, I>;

type ParsePosition<T extends Toks, I extends number> =
	ParseExpr<T, I, 7> extends infer X
		? X extends Ok<infer Sub, infer J>
			? EatWord<T, J, "in"> extends never
				? Expected<"IN", T, J>
				: ParseExpr<T, EatWord<T, J, "in">, 0> extends infer Y
					? Y extends Ok<infer In, infer J2>
						? EatOp<T, J2, ")"> extends never
							? Expected<'")"', T, J2>
							: Ok<PositionNode<Sub, In>, EatOp<T, J2, ")">>
						: Y
					: never
			: X
		: never;

type ParseSubstring<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatOp<T, J, ","> extends never
				? ParseSubstringFromFor<T, E, J>
				: ParseExprList<T, EatOp<T, J, ",">, []> extends infer Y
					? Y extends Ok<readonly [infer From, ...infer More], infer J2>
						? CloseSubstring<
								T,
								E,
								From,
								More extends readonly [infer For, ...unknown[]] ? For : null,
								J2
							>
						: Y
					: never
			: X
		: never;
type ParseSubstringFromFor<T extends Toks, E, I extends number> =
	EatWord<T, I, "from"> extends never
		? EatWord<T, I, "for"> extends never
			? EatWord<T, I, "similar"> extends never
				? CloseSubstring<T, E, null, null, I>
				: SubstringOperands<
							T,
							EatWord<T, I, "similar">,
							"escape"
						> extends infer X
					? X extends Ok<{ a: infer P; b: infer C }, infer J>
						? C extends null
							? Expected<"ESCAPE", T, J>
							: CloseSubstring<T, E, P, C, J>
						: X
					: never
			: SubstringOperands<T, EatWord<T, I, "for">, "from"> extends infer X
				? X extends Ok<{ a: infer For; b: infer From }, infer J>
					? CloseSubstring<T, E, From, For, J>
					: X
				: never
		: SubstringOperands<T, EatWord<T, I, "from">, "for"> extends infer X
			? X extends Ok<{ a: infer From; b: infer For }, infer J>
				? CloseSubstring<T, E, From, For, J>
				: X
			: never;
type SubstringOperands<T extends Toks, I extends number, W extends string> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer A, infer J>
			? EatWord<T, J, W> extends never
				? Ok<{ a: A; b: null }, J>
				: ParseExpr<T, EatWord<T, J, W>, 0> extends infer Y
					? Y extends Ok<infer B, infer J2>
						? Ok<{ a: A; b: B }, J2>
						: Y
					: never
			: X
		: never;
type CloseSubstring<T extends Toks, E, From, For, I extends number> =
	EatOp<T, I, ")"> extends never
		? Expected<'")"', T, I>
		: Ok<SubstringNode<E, From, For>, EatOp<T, I, ")">>;

type ParseTrim<T extends Toks, I extends number> =
	T[I] extends WordTok<infer Side extends "both" | "leading" | "trailing">
		? ParseTrimBody<T, Nx<I>, Side>
		: ParseTrimBody<T, I, "both">;
type ParseTrimBody<T extends Toks, I extends number, Side extends string> =
	EatWord<T, I, "from"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer E1, infer J>
				? EatWord<T, J, "from"> extends never
					? EatOp<T, J, ","> extends never
						? EatOp<T, J, ")"> extends never
							? Expected<'")"', T, J>
							: Ok<TrimNode<E1, null, Side>, EatOp<T, J, ")">>
						: ParseExpr<T, EatOp<T, J, ",">, 0> extends infer Y
							? Y extends Ok<infer C, infer J2>
								? EatOp<T, J2, ")"> extends never
									? Expected<'")"', T, J2>
									: Ok<TrimNode<E1, C, Side>, EatOp<T, J2, ")">>
								: Y
							: never
					: ParseExpr<T, EatWord<T, J, "from">, 0> extends infer Y
						? Y extends Ok<infer E, infer J2>
							? EatOp<T, J2, ")"> extends never
								? Expected<'")"', T, J2>
								: Ok<TrimNode<E, E1, Side>, EatOp<T, J2, ")">>
							: Y
						: never
				: X
			: never
		: ParseExpr<T, EatWord<T, I, "from">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<TrimNode<E, null, Side>, EatOp<T, J, ")">>
				: X
			: never;

type ParseOverlay<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatWord<T, J, "placing"> extends never
				? Expected<"PLACING", T, J>
				: ParseExpr<T, EatWord<T, J, "placing">, 0> extends infer Y
					? Y extends Ok<infer P, infer J2>
						? EatWord<T, J2, "from"> extends never
							? Expected<"FROM", T, J2>
							: ParseExpr<T, EatWord<T, J2, "from">, 0> extends infer Z
								? Z extends Ok<infer From, infer J3>
									? EatWord<T, J3, "for"> extends never
										? CloseOverlay<T, E, P, From, null, J3>
										: ParseExpr<T, EatWord<T, J3, "for">, 0> extends infer V
											? V extends Ok<infer For, infer J4>
												? CloseOverlay<T, E, P, From, For, J4>
												: V
											: never
									: Z
								: never
						: Y
					: never
			: X
		: never;
type CloseOverlay<T extends Toks, E, P, From, For, I extends number> =
	EatOp<T, I, ")"> extends never
		? Expected<'")"', T, I>
		: Ok<OverlayNode<E, P, From, For>, EatOp<T, I, ")">>;

export type ParseExprList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, E], J>
				: ParseExprList<T, EatOp<T, J, ",">, [...Acc, E]>
			: X
		: never;

export type ParseOrderList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[] = [],
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatOp<T, SkipOrderTail<T, J>, ","> extends never
				? Ok<[...Acc, E], SkipOrderTail<T, J>>
				: ParseOrderList<T, EatOp<T, SkipOrderTail<T, J>, ",">, [...Acc, E]>
			: X
		: never;
export type SkipOrderTail<T extends Toks, I extends number> = SkipNulls<
	T,
	EatWord<T, I, "asc" | "desc"> extends never
		? T[I] extends WordTok<"using">
			? T[Nx<I>] extends OpTok
				? Nx<Nx<I>>
				: I
			: I
		: EatWord<T, I, "asc" | "desc">
>;
type SkipNulls<T extends Toks, I extends number> =
	EatWords<T, I, ["nulls", "first"]> extends never
		? EatWords<T, I, ["nulls", "last"]> extends never
			? I
			: EatWords<T, I, ["nulls", "last"]>
		: EatWords<T, I, ["nulls", "first"]>;

type TagColParam = { readonly t: "col" | "param" };
type TagSubFieldIdxSlice = { readonly t: "sub" | "field" | "idx" | "slice" };
type TagRow = { readonly t: "row" };
