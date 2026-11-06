import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { IsTest, Tag } from "../ast.js";
import type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	WordTok,
} from "../lexer/tokens.js";
import type { CompareOp } from "../ops.js";
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
	RefNode,
	RefOf,
} from "./select.js";
import type {
	IntervalFields,
	ParsePrecision,
	ParseTypeName,
} from "./typename.js";
import type {
	AnyLabel,
	Close,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	FuncName,
	Nx2,
	Nx3,
	Ok,
	QualName,
	SkipFirst,
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
export type StarNode<Tbl> = { t: "star"; tbl: Tbl };
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
export type CallNode<Name, Args, Distinct, Filter, Over, Win, WithinGroup> = {
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
		? T[Next<I>] extends OpTok<Terminator> | undefined
			? Ok<ParamNode<N>, Next<I>>
			: ParseInfix<T, ParamNode<N>, Next<I>, Min>
		: T[I] extends WordTok | IdTok
			? T[I] extends WordTok<PrefixKeyword>
				? ParseExprSlow<T, I, Min>
				: ColumnPrefix<T[I], T[Next<I>], T[Nx2<I>], T[Nx3<I>]> extends infer P
					? P extends [infer L, infer N]
						? ParseInfix<T, L, N extends 1 ? Next<I> : Nx3<I>, Min>
						: ParseExprSlow<T, I, Min>
					: never
			: ParseExprSlow<T, I, Min>;

type ParseExprSlow<T extends Toks, I extends number, Min extends MinPrec> =
	ParsePrefix<T, I> extends infer R
		? R extends Ok<infer L, infer J>
			? ParseInfix<T, L, J, Min>
			: R
		: never;

type Prec = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
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

type ParseInfix<T extends Toks, L, I extends number, Min extends MinPrec> =
	InfixAction<T[I], Min> extends "done"
		? Ok<L, I>
		: Min extends "target"
			? T[I] extends WordTok<infer W>
				? W extends NotBareLabel
					? ParseInfixAt<T, L, I, Min>
					: T[Next<I>] extends OpTok<",">
						? Ok<L, I>
						: EndsTargetList<T, Next<I>> extends true
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
						: O extends CompareOp
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
> = InfixOps<T, L, I, Min, T[I]["v"] & string>[InfixAction<T[I], Min>];
type InfixOps<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	O extends string,
> = {
	done: Ok<L, I>;
	cast: ParseCastSuffix<T, L, Next<I>, Min>;
	subscript: L extends Indirectable | Tag<"col" | "param">
		? ParseSubscript<T, L, Next<I>, Min>
		: Ok<L, I>;
	field: L extends Indirectable
		? ParseFieldAccess<T, L, Next<I>, Min>
		: Ok<L, I>;
	comparison: ParseComparisonRhs<T, L, O, Next<I>, Min>;
	add: BinRhs<T, L, O, 8, I, Next<I>, Min>;
	multiply: BinRhs<T, L, O, 9, I, Next<I>, Min>;
	power: BinRhs<T, L, O, 10, I, Next<I>, Min>;
	binary: BinRhs<T, L, O, 7, I, Next<I>, Min>;
	and: ParseChain<T, "and", 3, [L], Next<I>, Min>;
	or: ParseChain<T, "or", 2, [L], Next<I>, Min>;
	is: ParseIs<T, L, Next<I>, Min>;
	isnull: ParseInfix<T, IsTest_<L, "null", false>, Next<I>, Min>;
	notnull: ParseInfix<T, IsTest_<L, "null", true>, Next<I>, Min>;
	not: ParseNegated<T, L, Next<I>, Min, I>;
	in: ParseIn<T, L, Next<I>, Min, false>;
	like: ParseLike<T, L, Next<I>, Min, "like", false>;
	ilike: ParseLike<T, L, Next<I>, Min, "ilike", false>;
	similar: EatWord<T, Next<I>, "to"> extends never
		? Ok<L, I>
		: ParseLike<T, L, Nx2<I>, Min, "similar", false>;
	between: ParseBetween<T, L, Next<I>, Min, false>;
	at: ParseAtTimeZone<T, L, Next<I>, Min>;
	collate: ParseCollate<T, L, Next<I>, Min>;
	operator: ParseOperatorSyntax<T, L, Next<I>, Min, I>;
	overlaps: L extends {
		readonly t: "row";
		readonly items: infer Ls extends readonly unknown[];
	}
		? ParseOverlaps<T, Ls, Next<I>, Min>
		: Ok<L, I>;
};

type Indirectable = Tag<"sub" | "field" | "idx" | "slice">;

type NonAssoc<
	T extends Toks,
	L,
	J extends number,
	Min extends MinPrec,
	P extends 4 | 5 | 6,
> = PrecAt<T, J> extends P ? SyntaxErrorAt<T, J> : ParseInfix<T, L, J, Min>;
type PrecAt<T extends Toks, J extends number> =
	T[J] extends OpTok<CompareOp>
		? 5
		: T[J] extends WordTok<infer W>
			? W extends "is" | "isnull" | "notnull"
				? 4
				: W extends Prec6Word
					? 6
					: W extends "not"
						? T[Next<J>] extends WordTok<Prec6Word>
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
	ParseExpr<T, I, P> extends Ok<infer E, infer J>
		? T[J] extends WordTok<Op>
			? Min extends "target"
				? T[Next<J>] extends OpTok<",">
					? Ok<Balance<[...Items, E], Op>, J>
					: EndsTargetList<T, Next<J>> extends true
						? Ok<Balance<[...Items, E], Op>, J>
						: ParseChain<T, Op, P, [...Items, E], Next<J>, Min>
				: ParseChain<T, Op, P, [...Items, E], Next<J>, Min>
			: ParseInfix<T, Balance<[...Items, E], Op>, J, Min>
		: ParseExpr<T, I, P>;
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
			? T[Next<I>] extends OpTok<"(">
				? ParseQuantified<T, L, O, Q extends "all" ? "all" : "any", Nx2<I>, Min>
				: SyntaxErrorAt<T, Next<I>>
			: ParseExpr<T, I, NextPrec[Bp]> extends Ok<infer Rhs, infer J>
				? ParseInfix<T, BinNode<O, L, Rhs>, J, Min>
				: ParseExpr<T, I, NextPrec[Bp]>
		: Ok<L, I0>;

type ParseComparisonRhs<
	T extends Toks,
	L,
	O extends string,
	I extends number,
	Min extends MinPrec,
> =
	T[I] extends WordTok<infer Q extends "any" | "some" | "all">
		? T[Next<I>] extends OpTok<"(">
			? ParseQuantified<T, L, O, Q extends "all" ? "all" : "any", Nx2<I>, Min>
			: SyntaxErrorAt<T, Next<I>>
		: ParseExpr<T, I, 6> extends Ok<infer Rhs, infer J>
			? NonAssoc<T, BinNode<O, L, Rhs>, J, Min, 5>
			: ParseExpr<T, I, 6>;

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
			: ParseInfix<T, QuantNode<L, O, Q, S>, Next<J>, Min>
		: ParseQuantifiedExpr<T, L, O, Q, I, Min>;
type ParseQuantifiedExpr<
	T extends Toks,
	L,
	O extends string,
	Q extends "any" | "all",
	I extends number,
	Min extends MinPrec,
> =
	ParseExpr<T, I, 0> extends Ok<infer A, infer J>
		? EatOp<T, J, ")"> extends never
			? Expected<'")"', T, J>
			: ParseInfix<T, QuantNode<L, O, Q, A>, Next<J>, Min>
		: ParseExpr<T, I, 0>;

type ParseCastSuffix<T extends Toks, L, I extends number, Min extends MinPrec> =
	ParseTypeName<T, I> extends Ok<infer Ty, infer J>
		? ParseInfix<T, CastNode<L, Ty>, J, Min>
		: ParseTypeName<T, I>;

type ParseSubscript<T extends Toks, L, I extends number, Min extends MinPrec> =
	ParseBracket<T, L, I> extends Ok<infer N, infer J>
		? ParseInfix<T, N, J, Min>
		: ParseBracket<T, L, I>;
export type ParseBracket<T extends Toks, L, I extends number> =
	EatOp<T, I, ":"> extends never
		? ParseExpr<T, I, 0> extends Ok<infer Ix, infer J>
			? EatOp<T, J, "]"> extends never
				? EatOp<T, J, ":"> extends never
					? Expected<'"]"', T, J>
					: ParseSliceHi<T, L, Ix, Next<J>>
				: Ok<IdxNode<L, Ix>, Next<J>>
			: ParseExpr<T, I, 0>
		: ParseSliceHi<T, L, null, Next<I>>;
type ParseSliceHi<T extends Toks, L, Lo, I extends number> =
	EatOp<T, I, "]"> extends never
		? ParseExpr<T, I, 0> extends Ok<infer Hi, infer J>
			? Close<T, J, SliceNode<L, Lo, Hi>, "]">
			: ParseExpr<T, I, 0>
		: Ok<SliceNode<L, Lo, null>, Next<I>>;

type ParseFieldAccess<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
> =
	T[I] extends OpTok<"*">
		? ParseInfix<T, FieldNode<L, "*">, Next<I>, Min>
		: AnyLabel<T, I> extends [infer N, infer J extends number]
			? ParseInfix<T, FieldNode<L, N>, J, Min>
			: Expected<"field name", T, I>;

type ParseIs<T extends Toks, L, I extends number, Min extends MinPrec> =
	EatWord<T, I, "not"> extends never
		? ParseIsBody<T, L, I, Min, false>
		: ParseIsBody<T, L, Next<I>, Min, true>;
type ParseIsBody<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	T[I] extends WordTok<infer W>
		? W extends "null" | "true" | "false" | "unknown"
			? ParseInfix<T, IsTest_<L, W, Not>, Next<I>, Min>
			: W extends "document"
				? ParseInfix<T, XmlIsDocument<L, Not>, Next<I>, Min>
				: W extends "json"
					? ParseInfix<
							T,
							IsJsonNode<L, Not>,
							SkipUniqueKeys<
								T,
								SkipWord<T, Next<I>, "value" | "scalar" | "array" | "object">
							>,
							Min
						>
					: W extends "normalized"
						? ParseInfix<
								T,
								NotIf<CallOf<"is_normalized", [L]>, Not>,
								Next<I>,
								Min
							>
						: W extends "nfc" | "nfd" | "nfkc" | "nfkd"
							? T[Next<I>] extends WordTok<"normalized">
								? ParseInfix<
										T,
										NotIf<
											CallOf<"is_normalized", [L, StrNode<Uppercase<W>>]>,
											Not
										>,
										Nx2<I>,
										Min
									>
								: Expected<"NORMALIZED", T, Next<I>>
							: W extends "distinct"
								? EatWord<T, Next<I>, "from"> extends never
									? Expected<"FROM", T, Next<I>>
									: ParseExpr<T, Nx2<I>, 5> extends Ok<infer Rhs, infer J>
										? NonAssoc<T, DistinctNode<L, Rhs, Not>, J, Min, 4>
										: ParseExpr<T, Nx2<I>, 5>
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
			? ParseIn<T, L, Next<I>, Min, true>
			: W extends "like" | "ilike"
				? ParseLike<T, L, Next<I>, Min, W, true>
				: W extends "similar"
					? EatWord<T, Next<I>, "to"> extends never
						? Expected<"TO", T, Next<I>>
						: ParseLike<T, L, Nx2<I>, Min, "similar", true>
					: W extends "between"
						? ParseBetween<T, L, Next<I>, Min, true>
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
		: IsSelectStart<T, Next<I>> extends true
			? ParseSelectStmt<T, Next<I>> extends Ok<infer S, infer J>
				? EatOp<T, J, ")"> extends never
					? T[Next<I>] extends OpTok<"(">
						? ParseInList<T, L, Next<I>, Min, Not>
						: Expected<'")"', T, J>
					: ParseInfix<T, InSubNode<L, S, Not>, Next<J>, Min>
				: ParseSelectStmt<T, Next<I>>
			: ParseInList<T, L, Next<I>, Min, Not>;
type ParseInList<
	T extends Toks,
	L,
	I extends number,
	Min extends MinPrec,
	Not extends boolean,
> =
	ParseExprList<T, I, []> extends Ok<infer List, infer J>
		? EatOp<T, J, ")"> extends never
			? Expected<'")"', T, J>
			: ParseInfix<T, InNode<L, List, Not>, Next<J>, Min>
		: ParseExprList<T, I, []>;

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
			: T[Next<I>] extends OpTok<"(">
				? ParseQuantified<
						T,
						L,
						LikeOp<Kind, Not>,
						Q extends "all" ? "all" : "any",
						Nx2<I>,
						Min
					>
				: SyntaxErrorAt<T, Next<I>>
		: ParseExpr<T, I, 7> extends Ok<infer Pat, infer J>
			? EatWord<T, J, "escape"> extends never
				? NonAssoc<T, LikeNode<L, Pat, Kind, Not>, J, Min, 6>
				: ParseExpr<T, Next<J>, 7> extends Ok<unknown, infer J2>
					? NonAssoc<T, LikeNode<L, Pat, Kind, Not>, J2, Min, 6>
					: ParseExpr<T, Next<J>, 7>
			: ParseExpr<T, I, 7>;

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
	ParseExpr<T, SkipWord<T, I, "symmetric" | "asymmetric">, 7> extends Ok<
		infer Lo,
		infer J
	>
		? EatWord<T, J, "and"> extends never
			? Expected<"AND", T, J>
			: ParseExpr<T, Next<J>, 7> extends Ok<infer Hi, infer J2>
				? NonAssoc<T, BetweenNode<L, Lo, Hi, Not>, J2, Min, 6>
				: ParseExpr<T, Next<J>, 7>
		: ParseExpr<T, SkipWord<T, I, "symmetric" | "asymmetric">, 7>;

type ParseAtTimeZone<T extends Toks, L, I extends number, Min extends MinPrec> =
	T[I] extends WordTok<"local">
		? ParseInfix<T, CallOf<"timezone", [L]>, Next<I>, Min>
		: EatWords<T, I, ["time", "zone"]> extends never
			? Expected<"TIME ZONE or LOCAL", T, I>
			: ParseExpr<T, Nx2<I>, 11> extends Ok<infer Z, infer J>
				? ParseInfix<T, AtTzNode<L, Z>, J, Min>
				: ParseExpr<T, Nx2<I>, 11>;

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
	? ParsePrefix<T, I> extends Ok<infer R, infer J>
		? R extends {
				readonly t: "row";
				readonly items: readonly [infer C, infer D];
			}
			? ParseInfix<T, CallOf<"overlaps", [A, B, C, D]>, J, Min>
			: R extends Tag<"row">
				? Fail<
						"wrong number of parameters on right side of OVERLAPS expression",
						I
					>
				: SyntaxErrorAt<T, I>
		: ParsePrefix<T, I>
	: Fail<"wrong number of parameters on left side of OVERLAPS expression", I>;
export type CallOf<Name extends string, Args> = CallNode<
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
		? QualOp<T, Next<I>> extends [
				infer O extends string,
				infer J extends number,
			]
			? BinRhs<T, L, O, 7, I0, J, Min>
			: SyntaxErrorAt<T, Extract<QualOp<T, Next<I>>, number>>
		: Ok<L, I0>;
type QualOp<T extends Toks, I extends number> =
	T[I] extends OpTok<infer O>
		? T[Next<I>] extends OpTok<")">
			? [O, Nx2<I>]
			: Next<I>
		: T[Next<I>] extends OpTok<".">
			? QualOp<T, Nx2<I>>
			: Next<I>;
type ParseQualPrefix<T extends Toks, I extends number> =
	QualOp<T, I> extends [infer O, infer J extends number]
		? ParseExpr<T, J, 8> extends Ok<infer E, infer J2>
			? Ok<UnNode<O, E>, J2>
			: ParseExpr<T, J, 8>
		: SyntaxErrorAt<T, Extract<QualOp<T, I>, number>>;

type ParenFormWord =
	| "exists"
	| "row"
	| "extract"
	| "position"
	| "substring"
	| "trim"
	| "overlay"
	| "operator"
	| "normalize";
type PrefixKeyword =
	| ParenFormWord
	| keyof PrefixWords
	| ReservedKeyword
	| XmlFuncKeyword
	| ConstTypeWord
	| SpecialValueFunction
	| "not"
	| "case"
	| "cast"
	| "array"
	| "collation";

type ParsePrefix<T extends Toks, I extends number> =
	T[I] extends NumTok<infer V>
		? Ok<NumNode<V>, Next<I>>
		: T[I] extends StrTok<infer V>
			? T[I] extends { readonly bits: true }
				? Ok<{ t: "typed"; type: "bit"; v: V; bits: true }, Next<I>>
				: Ok<StrNode<V>, Next<I>>
			: T[I] extends ParamTok<infer N>
				? Ok<ParamNode<N>, Next<I>>
				: T[I] extends OpTok<infer O>
					? O extends "("
						? ParseParen<T, Next<I>>
						: O extends "*"
							? Ok<StarNode<null>, Next<I>>
							: O extends "["
								? ParseArrayLiteral<T, Next<I>>
								: O extends NotPrefixOp
									? SyntaxErrorAt<T, I>
									: ParseUnary<T, O, Next<I>>
					: T[I] extends IdTok
						? ParseNameExpr<T, I>
						: T[I] extends WordTok<infer W>
							? ParseKeywordPrefix<T, I, W>
							: Fail<"syntax error at end of input", I>;

type ParseKeywordPrefix<
	T extends Toks,
	I extends number,
	W extends string,
> = W extends ParenFormWord
	? T[Next<I>] extends OpTok<"(">
		? ParenForms<T, Nx2<I>>[W]
		: ParseNameExpr<T, I>
	: W extends keyof PrefixWords
		? Ok<PrefixWords[W], Next<I>>
		: W extends "not"
			? ParseUnary<T, "not", Next<I>>
			: W extends "case"
				? ParseCase<T, Next<I>>
				: W extends "cast"
					? ParseCast<T, Next<I>>
					: W extends "array"
						? ParseArray<T, Next<I>>
						: W extends SpecialValueFunction
							? ParseSpecialValue<T, W, I>
							: W extends XmlFuncKeyword
								? T[Next<I>] extends OpTok<"(">
									? ParseXmlFunc<T, W, Nx2<I>>
									: ParseNameExpr<T, I>
								: W extends ConstTypeWord
									? ParseConstTypeLit<T, I>
									: W extends "collation"
										? T[Next<I>] extends WordTok<"for">
											? ParseCollationFor<T, Nx2<I>>
											: ParseNameExpr<T, I>
										: W extends ReservedKeyword
											? SyntaxErrorAt<T, I>
											: ParseNameExpr<T, I>;
type PrefixWords = {
	null: { t: "null" };
	true: BoolNode<true>;
	false: BoolNode<false>;
	default: { t: "default" };
};
type ParenForms<T extends Toks, I extends number> = {
	exists: ParseExists<T, I>;
	row: ParseRow<T, I>;
	extract: ParseExtract<T, I>;
	position: ParsePosition<T, I>;
	substring: ParseSubstring<T, I>;
	trim: ParseTrim<T, I>;
	overlay: ParseOverlay<T, I>;
	operator: ParseQualPrefix<T, I>;
	normalize: ParseNormalize<T, I>;
};

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
					: Ok<TypedNode<Ty, V>, Next<J>>
			: ParseNameExpr<T, I>
		: ParseNameExpr<T, I>;

type ParseIntervalLit<T extends Toks, I extends number, V, J extends number> =
	T[Next<I>] extends OpTok<"(">
		? Ok<TypedNode<"interval", V>, Next<J>>
		: Next<I> extends J
			? IntervalFields<T, Next<J>> extends infer K extends number
				? Ok<TypedNode<"interval", V>, K>
				: IntervalFields<T, Next<J>>
			: SyntaxErrorAt<T, Next<I>>;

type ParseCollationFor<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExpr<T, Next<I>, 0> extends Ok<infer E, infer J>
			? Close<T, J, CallOf<"pg_collation_for", [E]>>
			: ParseExpr<T, Next<I>, 0>;

type ParseNormalize<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? T[J] extends OpTok<")">
			? Ok<CallOf<"normalize", [E]>, Next<J>>
			: T[J] extends OpTok<",">
				? T[Next<J>] extends WordTok<
						infer F extends "nfc" | "nfd" | "nfkc" | "nfkd"
					>
					? T[Nx2<J>] extends OpTok<")">
						? Ok<CallOf<"normalize", [E, StrNode<Uppercase<F>>]>, Nx3<J>>
						: Expected<'")"', T, Nx2<J>>
					: Expected<"NFC, NFD, NFKC or NFKD", T, Next<J>>
				: Expected<'")"', T, J>
		: ParseExpr<T, I, 0>;

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
	T[Next<I>] extends OpTok<"(">
		? W extends "current_schema"
			? ParseNameExpr<T, I>
			: W extends PrecisionValueFunction
				? ParsePrecision<T, Nx2<I>> extends infer J extends number
					? SpecialValue<W, J>
					: ParsePrecision<T, Nx2<I>>
				: SyntaxErrorAt<T, Next<I>>
		: SpecialValue<W, Next<I>>;

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
		? ParseSelectStmt<T, I> extends Ok<infer S, infer J>
			? EatOp<T, J, ")"> extends never
				? // ((SELECT 1) - 1): a parenthesized subquery inside an expression.
					T[I] extends OpTok<"(">
					? ParseParenExpr<T, I>
					: Expected<'")"', T, J>
				: Ok<SubNode<S>, Next<J>>
			: ParseSelectStmt<T, I>
		: ParseParenExpr<T, I>;
type ParseParenExpr<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatOp<T, J, ")"> extends never
			? EatOp<T, J, ","> extends never
				? Expected<'")"', T, J>
				: ParseExprList<T, Next<J>, [E]> extends Ok<infer Items, infer J2>
					? Close<T, J2, RowNode<Items>>
					: ParseExprList<T, Next<J>, [E]>
			: T[Next<J>] extends OpTok<".">
				? ParseParenField<T, E, Nx2<J>>
				: T[Next<J>] extends OpTok<"[">
					? ParseSubscript<T, E, Nx2<J>, 13>
					: Ok<E, Next<J>>
		: ParseExpr<T, I, 0>;
type ParseParenField<T extends Toks, E, I extends number> =
	T[I] extends OpTok<"*">
		? Ok<FieldNode<E, "*">, Next<I>>
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
	ColumnPrefix<T[I], T[Next<I>], T[Nx2<I>], T[Nx3<I>]> extends infer R
		? R extends [infer E, infer N]
			? Ok<E, N extends 1 ? Next<I> : Nx3<I>>
			: ParseNameExprSlow<T, I>
		: never;

type ParseNameExprSlow<T extends Toks, I extends number> =
	FuncName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? T[I] extends WordTok<infer W extends JsonFuncWord>
				? T[Next<I>] extends OpTok<"(">
					? ParseJsonFunc<T, W, I>
					: ParseCall<T, LastOf<Parts>, Next<J>>
				: ParseCall<T, LastOf<Parts>, Next<J>>
			: T[J] extends OpTok<".">
				? T[Next<J>] extends OpTok<"*">
					? Ok<StarNode<LastOf<Parts>>, Nx2<J>>
					: SyntaxErrorAt<T, Next<J>>
				: T[J] extends StrTok<infer V>
					? Parts["length"] extends 1 | 2
						? Ok<TypedNode<NormalizeTypeName<LastOf<Parts>>, V>, Next<J>>
						: SyntaxErrorAt<T, J>
					: Ok<ColRefOf<Parts>, J>
		: SyntaxErrorAt<T, Next<I>>;

export type LastOf<Parts extends readonly string[]> = Parts extends readonly [
	...string[],
	infer L,
]
	? L
	: never;
type ColRefOf<Parts extends readonly string[]> =
	RefOf<Parts> extends RefNode<infer Tb, infer C> ? ColNode<Tb, C> : never;

export type ParseCall<T extends Toks, Name extends string, I extends number> =
	T[I] extends OpTok<")">
		? ParseCallSuffix<T, Name, [], false, Next<I>>
		: T[I] extends OpTok<"*">
			? T[Next<I>] extends OpTok<")">
				? ParseCallSuffix<T, Name, [StarNode<null>], false, Nx2<I>>
				: SyntaxErrorAt<T, Next<I>>
			: EatWord<T, I, "distinct"> extends never
				? ParseCallArgs<T, Name, SkipWord<T, I, "all">, false>
				: ParseCallArgs<T, Name, Next<I>, true>;

type ParseCallArgs<
	T extends Toks,
	Name extends string,
	I extends number,
	Distinct extends boolean,
> =
	ParseArgList<T, I, [], never> extends Ok<infer Args, infer J>
		? SkipAggOrderBy<T, J> extends infer J2 extends number
			? EatOp<T, J2, ")"> extends never
				? Expected<'")"', T, J2>
				: ParseCallSuffix<T, Name, Args, Distinct, Next<J2>>
			: SkipAggOrderBy<T, J>
		: ParseArgList<T, I, [], never>;

type ParseArgList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Names extends string,
> =
	T[I] extends WordTok<"variadic">
		? ParseArg<T, Next<I>, Names> extends Ok<infer E, infer J>
			? Ok<[...Acc, VariadicNode<E>], J>
			: ParseArg<T, Next<I>, Names>
		: ParseArg<T, I, Names> extends Ok<infer E, infer J>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, E], J>
				: ParseArgList<
						T,
						Next<J>,
						[...Acc, E],
						| Names
						| (E extends {
								readonly t: "named";
								readonly name: infer N extends string;
						  }
								? N
								: never)
					>
			: ParseArg<T, I, Names>;
type ParseArg<T extends Toks, I extends number, Names extends string> =
	T[Next<I>] extends OpTok<"=>" | ":=">
		? ArgName<T, I> extends infer N extends string
			? N extends Names
				? Fail<`argument name "${N}" used more than once`, I>
				: ParseExpr<T, Nx2<I>, 0> extends Ok<infer E, infer J>
					? Ok<NamedNode<N, E>, J>
					: ParseExpr<T, Nx2<I>, 0>
			: T[I] extends WordTok<ReservedKeyword>
				? SyntaxErrorAt<T, I>
				: SyntaxErrorAt<T, Next<I>>
		: [Names] extends [never]
			? ParseExpr<T, I, 0>
			: ParseExpr<T, I, 0> extends Ok<unknown, number>
				? Fail<"positional argument cannot follow named argument", I>
				: ParseExpr<T, I, 0>;
type ArgName<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? V
		: T[I] extends WordTok<infer V>
			? V extends NotTypeFuncName
				? null
				: V
			: null;

export type SkipAggOrderBy<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? I
		: ParseOrderList<T, Nx2<I>> extends Ok<unknown, infer J>
			? J
			: ParseOrderList<T, Nx2<I>>;

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
	ParseWithinGroup<T, I> extends Ok<infer WG, infer I1>
		? ParseFilter<T, I1> extends Ok<infer Flt, infer I2>
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
			: ParseFilter<T, I1>
		: ParseWithinGroup<T, I>;

type ParseWithinGroup<T extends Toks, I extends number> =
	EatWords<T, I, ["within", "group"]> extends never
		? Ok<null, I>
		: EatOp<T, Nx2<I>, "("> extends never
			? Expected<'"("', T, Nx2<I>>
			: EatWords<T, Nx3<I>, ["order", "by"]> extends never
				? Expected<"ORDER BY", T, Nx3<I>>
				: ParseOrderList<T, Nx2<Nx3<I>>> extends Ok<infer Es, infer J>
					? Close<T, J, Es extends readonly [infer E] ? E : RowNode<Es>>
					: ParseOrderList<T, Nx2<Nx3<I>>>;

export type ParseFilter<T extends Toks, I extends number> =
	EatWord<T, I, "filter"> extends never
		? Ok<null, I>
		: EatOp<T, Next<I>, "("> extends never
			? Expected<'"("', T, Next<I>>
			: EatWord<T, Nx2<I>, "where"> extends never
				? Expected<"WHERE", T, Nx2<I>>
				: ParseExpr<T, Nx3<I>, 0> extends Ok<infer E, infer J>
					? Close<T, J, E>
					: ParseExpr<T, Nx3<I>, 0>;

export type ParseOver<T extends Toks, I extends number> =
	EatWord<T, I, "over"> extends never
		? Ok<null, I>
		: T[Next<I>] extends OpTok<"(">
			? ParseWindowSpec<T, Nx2<I>>
			: T[Next<I>] extends WordTok<infer W> | IdTok<infer W>
				? Ok<{ name: W; partition: []; order: [] }, Nx2<I>>
				: Expected<"window specification", T, Next<I>>;

export type ParseWindowSpec<T extends Toks, I extends number> =
	WindowBaseName<T, I> extends [infer Name, infer I1 extends number]
		? ParseWindowPartition<T, I1> extends Ok<infer Part, infer I2>
			? ParseOrderByOpt<T, I2> extends Ok<infer Ord, infer I3>
				? ParseFrame<T, I3> extends Ok<infer Frame extends FrameInfo, infer I4>
					? FrameOrderError<
							T[I3],
							Frame["kinds"],
							Name,
							Ord
						> extends infer M extends string
						? Fail<M, I3>
						: Close<
								T,
								I4,
								{
									name: Name;
									partition: Part;
									order: Ord;
									emptyFrame: Frame["empty"];
								}
							>
					: ParseFrame<T, I3>
				: ParseOrderByOpt<T, I2>
			: ParseWindowPartition<T, I1>
		: never;
type WindowBaseName<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? [V, Next<I>]
		: T[I] extends WordTok<infer W>
			? W extends "partition" | "order" | "rows" | "range" | "groups"
				? [null, I]
				: [W, Next<I>]
			: [null, I];
type ParseWindowPartition<T extends Toks, I extends number> =
	EatWords<T, I, ["partition", "by"]> extends never
		? Ok<[], I>
		: ParseExprList<T, Nx2<I>, []>;
export type ParseOrderByOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? Ok<[], I>
		: ParseOrderList<T, Nx2<I>>;
/**
 * `empty`: the frame may hold no rows, because both bounds lie on one side of
 * the current row or EXCLUDE CURRENT ROW / GROUP removes it.
 */
type FrameInfo = { readonly kinds: unknown; readonly empty: boolean };
type ParseFrame<T extends Toks, I extends number> =
	EatWord<T, I, "rows" | "range" | "groups"> extends never
		? Ok<{ kinds: never; empty: false }, I>
		: EatWord<T, Next<I>, "between"> extends never
			? ParseFrameBound<T, Next<I>> extends readonly [
					infer S,
					infer J extends number,
				]
				? S extends "unbounded following"
					? Fail<"frame start cannot be UNBOUNDED FOLLOWING", I>
					: S extends "following"
						? Fail<
								"frame starting from following row cannot end with current row",
								I
							>
						: FrameExclusion<T, S, false, J>
				: ParseFrameBound<T, Next<I>>
			: ParseFrameBound<T, Nx2<I>> extends readonly [
						infer S,
						infer J extends number,
					]
				? EatWord<T, J, "and"> extends never
					? Expected<"AND", T, J>
					: ParseFrameBound<T, Next<J>> extends readonly [
								infer E,
								infer J2 extends number,
							]
						? FrameError<S, E> extends infer M extends string
							? Fail<M, I>
							: FrameExclusion<
									T,
									S | E,
									S extends "following"
										? true
										: E extends "preceding"
											? true
											: false,
									J2
								>
						: ParseFrameBound<T, Next<J>>
				: ParseFrameBound<T, Nx2<I>>;
type FrameExclusion<
	T extends Toks,
	Kinds,
	Empty extends boolean,
	I extends number,
> =
	SkipExclude<T, I> extends infer J extends number
		? Ok<
				{
					kinds: Kinds;
					empty: Empty extends true
						? true
						: EatWord<T, I, "exclude"> extends never
							? false
							: EatWords<T, Next<I>, ["current", "row"]> extends never
								? EatWord<T, Next<I>, "group"> extends never
									? false
									: true
								: true;
				},
				J
			>
		: SkipExclude<T, I>;
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
				? ParseExpr<T, I, 0> extends Ok<unknown, infer J>
					? T[J] extends WordTok<infer D extends "preceding" | "following">
						? [D, Next<J>]
						: Expected<"PRECEDING or FOLLOWING", T, J>
					: ParseExpr<T, I, 0>
				: ["current row", Nx2<I>]
			: ["unbounded following", Nx2<I>]
		: ["unbounded preceding", Nx2<I>];
type SkipExclude<T extends Toks, I extends number> =
	EatWord<T, I, "exclude"> extends never
		? I
		: EatWords<T, Next<I>, ["current", "row"]> extends never
			? EatWords<T, Next<I>, ["no", "others"]> extends never
				? EatWord<T, Next<I>, "group" | "ties"> extends never
					? Expected<"CURRENT ROW, GROUP, TIES or NO OTHERS", T, Next<I>>
					: Nx2<I>
				: Nx3<I>
			: Nx3<I>;

type ParseCase<T extends Toks, I extends number> =
	EatWord<T, I, "when"> extends never
		? ParseExpr<T, I, 0> extends Ok<infer Operand, infer J>
			? ParseCaseWhens<T, Operand, J, []>
			: ParseExpr<T, I, 0>
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
				: Ok<CaseNode<Operand, Acc, null>, Next<I>>
			: ParseExpr<T, Next<I>, 0> extends Ok<infer E, infer J>
				? EatWord<T, J, "end"> extends never
					? Expected<"END", T, J>
					: Ok<CaseNode<Operand, Acc, E>, Next<J>>
				: ParseExpr<T, Next<I>, 0>
		: ParseExpr<T, Next<I>, 0> extends Ok<infer W, infer J>
			? EatWord<T, J, "then"> extends never
				? Expected<"THEN", T, J>
				: ParseExpr<T, Next<J>, 0> extends Ok<infer Th, infer J2>
					? ParseCaseWhens<T, Operand, J2, [...Acc, { when: W; then: Th }]>
					: ParseExpr<T, Next<J>, 0>
			: ParseExpr<T, Next<I>, 0>;

type ParseCast<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExpr<T, Next<I>, 0> extends Ok<infer E, infer J>
			? EatWord<T, J, "as"> extends never
				? Expected<"AS", T, J>
				: ParseTypeName<T, Next<J>> extends Ok<infer Ty, infer J2>
					? Close<T, J2, CastNode<E, Ty>>
					: ParseTypeName<T, Next<J>>
			: ParseExpr<T, Next<I>, 0>;

type ParseExists<T extends Toks, I extends number> =
	ParseSelectStmt<T, I> extends Ok<infer S, infer J>
		? Close<T, J, ExistsNode<S>>
		: ParseSelectStmt<T, I>;

type ParseArray<T extends Toks, I extends number> =
	EatOp<T, I, "["> extends never
		? EatOp<T, I, "("> extends never
			? Expected<'"[" or "("', T, I>
			: ParseSelectStmt<T, Next<I>> extends Ok<infer S, infer J>
				? Close<T, J, ArraySubNode<S>>
				: ParseSelectStmt<T, Next<I>>
		: ParseArrayLiteral<T, Next<I>>;
type ParseArrayLiteral<T extends Toks, I extends number> =
	EatOp<T, I, "]"> extends never
		? ParseExprList<T, I, []> extends Ok<infer Items, infer J>
			? Close<T, J, ArrayNode<Items>, "]">
			: ParseExprList<T, I, []>
		: Ok<ArrayNode<[]>, Next<I>>;

type ParseRow<T extends Toks, I extends number> =
	EatOp<T, I, ")"> extends never
		? ParseExprList<T, I, []> extends Ok<infer Items, infer J>
			? Close<T, J, RowNode<Items>>
			: ParseExprList<T, I, []>
		: Ok<RowNode<[]>, Next<I>>;

type ParseExtract<T extends Toks, I extends number> = T[I] extends
	| WordTok<infer F>
	| StrTok<infer F>
	? EatWord<T, Next<I>, "from"> extends never
		? Expected<"FROM", T, Next<I>>
		: ParseExpr<T, Nx2<I>, 0> extends Ok<infer E, infer J>
			? Close<T, J, ExtractNode<F, E>>
			: ParseExpr<T, Nx2<I>, 0>
	: Expected<"field FROM expression", T, I>;

type ParsePosition<T extends Toks, I extends number> =
	ParseExpr<T, I, 7> extends Ok<infer Sub, infer J>
		? EatWord<T, J, "in"> extends never
			? Expected<"IN", T, J>
			: ParseExpr<T, Next<J>, 0> extends Ok<infer In, infer J2>
				? Close<T, J2, PositionNode<Sub, In>>
				: ParseExpr<T, Next<J>, 0>
		: ParseExpr<T, I, 7>;

type ParseSubstring<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatOp<T, J, ","> extends never
			? ParseSubstringFromFor<T, E, J>
			: ParseExprList<T, Next<J>, []> extends Ok<
						readonly [infer From, ...infer More],
						infer J2
					>
				? CloseSubstring<
						T,
						E,
						From,
						More extends readonly [infer For, ...unknown[]] ? For : null,
						J2
					>
				: ParseExprList<T, Next<J>, []>
		: ParseExpr<T, I, 0>;
type ParseSubstringFromFor<T extends Toks, E, I extends number> =
	EatWord<T, I, "from"> extends never
		? EatWord<T, I, "for"> extends never
			? EatWord<T, I, "similar"> extends never
				? CloseSubstring<T, E, null, null, I>
				: SubstringOperands<T, Next<I>, "escape"> extends Ok<
							{ a: infer P; b: infer C },
							infer J
						>
					? C extends null
						? Expected<"ESCAPE", T, J>
						: CloseSubstring<T, E, P, C, J>
					: SubstringOperands<T, Next<I>, "escape">
			: SubstringOperands<T, Next<I>, "from"> extends Ok<
						{ a: infer For; b: infer From },
						infer J
					>
				? CloseSubstring<T, E, From, For, J>
				: SubstringOperands<T, Next<I>, "from">
		: SubstringOperands<T, Next<I>, "for"> extends Ok<
					{ a: infer From; b: infer For },
					infer J
				>
			? CloseSubstring<T, E, From, For, J>
			: SubstringOperands<T, Next<I>, "for">;
type SubstringOperands<T extends Toks, I extends number, W extends string> =
	ParseExpr<T, I, 0> extends Ok<infer A, infer J>
		? EatWord<T, J, W> extends never
			? Ok<{ a: A; b: null }, J>
			: ParseExpr<T, Next<J>, 0> extends Ok<infer B, infer J2>
				? Ok<{ a: A; b: B }, J2>
				: ParseExpr<T, Next<J>, 0>
		: ParseExpr<T, I, 0>;
type CloseSubstring<T extends Toks, E, From, For, I extends number> = Close<
	T,
	I,
	SubstringNode<E, From, For>
>;

type ParseTrim<T extends Toks, I extends number> =
	T[I] extends WordTok<infer Side extends "both" | "leading" | "trailing">
		? ParseTrimBody<T, Next<I>, Side>
		: ParseTrimBody<T, I, "both">;
type ParseTrimBody<T extends Toks, I extends number, Side extends string> =
	EatWord<T, I, "from"> extends never
		? ParseExpr<T, I, 0> extends Ok<infer E1, infer J>
			? EatWord<T, J, "from"> extends never
				? EatOp<T, J, ","> extends never
					? Close<T, J, TrimNode<E1, null, Side>>
					: ParseExpr<T, Next<J>, 0> extends Ok<infer C, infer J2>
						? Close<T, J2, TrimNode<E1, C, Side>>
						: ParseExpr<T, Next<J>, 0>
				: ParseExpr<T, Next<J>, 0> extends Ok<infer E, infer J2>
					? Close<T, J2, TrimNode<E, E1, Side>>
					: ParseExpr<T, Next<J>, 0>
			: ParseExpr<T, I, 0>
		: ParseExpr<T, Next<I>, 0> extends Ok<infer E, infer J>
			? Close<T, J, TrimNode<E, null, Side>>
			: ParseExpr<T, Next<I>, 0>;

type ParseOverlay<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatWord<T, J, "placing"> extends never
			? Expected<"PLACING", T, J>
			: ParseExpr<T, Next<J>, 0> extends Ok<infer P, infer J2>
				? EatWord<T, J2, "from"> extends never
					? Expected<"FROM", T, J2>
					: ParseExpr<T, Next<J2>, 0> extends Ok<infer From, infer J3>
						? EatWord<T, J3, "for"> extends never
							? CloseOverlay<T, E, P, From, null, J3>
							: ParseExpr<T, Next<J3>, 0> extends Ok<infer For, infer J4>
								? CloseOverlay<T, E, P, From, For, J4>
								: ParseExpr<T, Next<J3>, 0>
						: ParseExpr<T, Next<J2>, 0>
				: ParseExpr<T, Next<J>, 0>
		: ParseExpr<T, I, 0>;
type CloseOverlay<T extends Toks, E, P, From, For, I extends number> = Close<
	T,
	I,
	OverlayNode<E, P, From, For>
>;

export type ParseExprList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, E], J>
			: ParseExprList<T, Next<J>, [...Acc, E]>
		: ParseExpr<T, I, 0>;

type ParseOrderList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[] = [],
> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatOp<T, SkipOrderTail<T, J>, ","> extends never
			? Ok<[...Acc, E], SkipOrderTail<T, J>>
			: ParseOrderList<T, Next<SkipOrderTail<T, J>>, [...Acc, E]>
		: ParseExpr<T, I, 0>;
type SkipOrderTail<T extends Toks, I extends number> = SkipFirst<
	T,
	EatWord<T, I, "asc" | "desc"> extends never
		? T[I] extends WordTok<"using">
			? T[Next<I>] extends OpTok
				? Nx2<I>
				: I
			: I
		: Next<I>,
	[["nulls", "first"], ["nulls", "last"]]
>;
