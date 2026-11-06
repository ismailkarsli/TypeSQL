import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { Expr, JoinKind, Tag } from "../ast.js";
import type { IdTok, OpTok, StrTok, WordTok } from "../lexer/tokens.js";
import type {
	ColNode,
	ParseExpr,
	ParseExprList,
	ParseOrderByOpt,
	ParseWindowSpec,
	StarNode,
} from "./expr.js";
import type { ParseJsonTable } from "./json.js";
import type { NotBareLabel } from "./keywords.js";
import type { ParseStatement } from "./stmt.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	Close,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	FuncName,
	Ident,
	Nx2,
	Nx3,
	Ok,
	ParenIdentList,
	QualName,
	SkipFirst,
	SkipToCloseParen,
	SkipWord,
	SyntaxErrorAt,
} from "./util.js";
import type { ParseXmlTable } from "./xml.js";

type SelectNode<W, Body, Order, Lim, Off> = {
	t: "select";
	with: W;
	body: Body;
	orderBy: Order;
	limit: Lim;
	offset: Off;
};
type SimpleNode<D, Ts, Fs, W, G, Sets, H, Wins> = {
	t: "simple";
	distinct: D;
	targets: Ts;
	from: Fs;
	where: W;
	groupBy: G;
	groupingSets: Sets;
	having: H;
	windows: Wins;
};
type TargetNode<E, A> = { e: E; alias: A };
type FromTableNode<Ref, A, CA> = {
	t: "table";
	ref: Ref;
	alias: A;
	colAliases: CA;
};
type FromSubNode<Q, A, CA, L> = {
	t: "sub";
	q: Q;
	alias: A;
	colAliases: CA;
	lateral: L;
};
type JoinNode<K, L, R, On, U, N> = {
	t: "join";
	kind: K;
	l: L;
	r: R;
	on: On;
	using: U;
	natural: N;
};
export type RefNode<S, N> = { schema: S; name: N };

type SetNode<Op, All, L, R> = { t: "setop"; op: Op; all: All; l: L; r: R };
type ParenNode<Q> = { t: "paren"; q: Q };
type ValuesNode<Rows> = { t: "values"; rows: Rows };
type CteNode<N, Cs, Q, Search, Cycle> = {
	name: N;
	cols: Cs;
	q: Q;
	search: Search;
	cycle: Cycle;
};
type WithNode<R, Cs> = { recursive: R; ctes: Cs };
type FromFuncNode<Call, A, CA, CD, L, Ord> = {
	t: "func";
	call: Call;
	alias: A;
	colAliases: CA;
	colDefs: CD;
	lateral: L;
	withOrdinality: Ord;
};
type FromJsonTableNode<JT, A, CA> = {
	t: "jsontable";
	jt: JT;
	alias: A;
	colAliases: CA;
};
type FromRowsNode<Fs, A, CA, CD, L, Ord> = {
	t: "rowsfrom";
	funcs: Fs;
	alias: A;
	colAliases: CA;
	colDefs: CD;
	lateral: L;
	withOrdinality: Ord;
};
type FromRowNode<Call, CD> = { call: Call; colDefs: CD };
type ColDefNode<N, Ty> = { name: N; type: Ty };
type WindowNode<N, Spec> = { name: N; spec: Spec };

export type IsSelectStart<T extends Toks, I extends number> =
	T[I] extends WordTok<"select" | "with" | "values" | "table">
		? true
		: T[I] extends OpTok<"(">
			? IsSelectStart<T, Next<I>>
			: false;

export type ParseSelectStmt<T extends Toks, I extends number> =
	EatWord<T, I, "with"> extends never
		? ParseSelectAfterWith<T, I, null>
		: ParseWith<T, Next<I>> extends Ok<infer Wc, infer J>
			? ParseSelectAfterWith<T, J, Wc>
			: ParseWith<T, Next<I>>;

export type ParseSelectAfterWith<T extends Toks, I extends number, W> =
	ParseSelectBody<T, I> extends infer B
		? B extends Ok<infer Body, infer J>
			? ParseSelectTail<T, Body, W, J>
			: B
		: never;

export type ParseSelectTail<T extends Toks, Body, W, I extends number> =
	ParseOrderByOpt<T, I> extends Ok<infer Order, infer J>
		? ParseOrderedTail<T, Body, W, Order, J>
		: ParseOrderByOpt<T, I>;

type ParseOrderedTail<T extends Toks, Body, W, Order, J extends number> =
	T[J] extends WordTok<"for" | "limit" | "offset" | "fetch">
		? LockingClause<T, J> extends [infer K1 extends number, infer Locks1]
			? ParseLimitOffset<T, K1, null, null, null> extends Ok<
					[infer Lim, infer Off, infer Ties],
					infer J2
				>
				? ParseLimitedTail<T, Body, W, Order, J, K1, Locks1, Lim, Off, Ties, J2>
				: ParseLimitOffset<T, K1, null, null, null>
			: LockingClause<T, J>
		: Ok<SelectNode<W, Body, Order, null, null>, J>;

type ParseLimitedTail<
	T extends Toks,
	Body,
	W,
	Order,
	J extends number,
	K1 extends number,
	Locks1,
	Lim,
	Off,
	Ties,
	J2 extends number,
> = (K1 extends J ? LockingClause<T, J2> : [J2, false]) extends [
	infer K3 extends number,
	infer Locks2,
]
	? TailError<Body, Order, Ties, Locks1, Locks2, J, J2> extends infer E
		? [E] extends [never]
			? Ok<SelectNode<W, Body, Order, Lim, Off>, K3>
			: E
		: never
	: K1 extends J
		? LockingClause<T, J2>
		: [J2, false];

type TailError<
	Body,
	Order,
	Ties,
	Locks1,
	Locks2,
	J extends number,
	J2 extends number,
> = Ties extends number
	? HasOrderBy<Order, Body> extends true
		? SetOpLocking<Body, Locks1, Locks2, J, J2>
		: Fail<"WITH TIES cannot be specified without ORDER BY clause", Ties>
	: SetOpLocking<Body, Locks1, Locks2, J, J2>;
type SetOpLocking<Body, Locks1, Locks2, J extends number, J2 extends number> =
	IsSetOp<Body> extends true
		? Locks1 extends true
			? Fail<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", J>
			: Locks2 extends true
				? Fail<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", J2>
				: never
		: never;
type IsSetOp<Body> =
	Body extends Tag<"setop">
		? true
		: Body extends {
					readonly t: "paren";
					readonly q: { readonly body: infer B };
				}
			? IsSetOp<B>
			: false;
type HasOrderBy<Order, Body> = Order extends readonly []
	? Body extends {
			readonly t: "paren";
			readonly q: { readonly orderBy: infer O; readonly body: infer B };
		}
		? HasOrderBy<O, B>
		: false
	: true;

type ParseLimitOffset<
	T extends Toks,
	I extends number,
	Lim,
	Off,
	Ties,
	Seen extends string = never,
> =
	T[I] extends WordTok<"offset">
		? "offset" extends Seen
			? SyntaxErrorAt<T, I>
			: ParseExpr<T, Next<I>, 0> extends Ok<infer E, infer J>
				? ParseLimitOffset<
						T,
						SkipWord<T, J, "row" | "rows">,
						Lim,
						E,
						Ties,
						Seen | "offset"
					>
				: ParseExpr<T, Next<I>, 0>
		: T[I] extends WordTok<"limit" | "fetch">
			? "limit" extends Seen
				? SyntaxErrorAt<T, I>
				: (
							T[I] extends WordTok<"fetch">
								? ParseFetch<T, Next<I>>
								: ParseLimit<T, I>
						) extends infer X
					? X extends Ok<[infer E, infer Ti], infer J>
						? ParseLimitOffset<T, J, E, Off, Ti, Seen | "limit">
						: X
					: never
			: Ok<[Lim, Off, Ties], I>;
type ParseLimit<T extends Toks, I extends number> = (
	EatWord<T, Next<I>, "all"> extends never
		? ParseExpr<T, Next<I>, 0>
		: Ok<null, Nx2<I>>
) extends infer X
	? X extends Ok<infer E, infer J>
		? T[J] extends OpTok<",">
			? Fail<"LIMIT #,# syntax is not supported", I>
			: Ok<[E, null], J>
		: X
	: never;
type ParseFetch<T extends Toks, I extends number> =
	EatWord<T, I, "first" | "next"> extends never
		? Expected<"FIRST or NEXT", T, I>
		: (
					EatWord<T, Next<I>, "row" | "rows"> extends never
						? ParseExpr<T, Next<I>, 0>
						: Ok<{ t: "num"; v: "1" }, Next<I>>
				) extends infer X
			? X extends Ok<infer E, infer J>
				? EatWord<T, J, "row" | "rows"> extends never
					? SyntaxErrorAt<T, J>
					: T[Next<J>] extends WordTok<"only">
						? Ok<[E, null], Nx2<J>>
						: EatWords<T, Next<J>, ["with", "ties"]> extends never
							? SyntaxErrorAt<T, Next<J>>
							: Ok<[E, Next<J>], Nx3<J>>
				: X
			: never;

type LockingClause<T extends Toks, I extends number> =
	EatWords<T, I, ["for", "read", "only"]> extends never
		? SkipLocking<T, I> extends infer K extends number
			? [K, K extends I ? false : true]
			: SkipLocking<T, I>
		: [Nx3<I>, false];
type SkipLocking<T extends Toks, I extends number> =
	EatWord<T, I, "for"> extends never
		? I
		: SkipLockStrength<T, Next<I>> extends Next<I>
			? I
			: SkipLockOf<T, SkipLockStrength<T, Next<I>>> extends infer J extends
						number
				? SkipLocking<T, SkipFirst<T, J, [["nowait"], ["skip", "locked"]]>>
				: SkipLockOf<T, SkipLockStrength<T, Next<I>>>;
type SkipLockStrength<T extends Toks, I extends number> = SkipFirst<
	T,
	I,
	[["update"], ["share"], ["no", "key", "update"], ["key", "share"]]
>;
type SkipLockOf<T extends Toks, I extends number> =
	EatWord<T, I, "of"> extends never ? I : SkipNameList<T, Next<I>>;
type SkipNameList<T extends Toks, I extends number> =
	QualName<T, I> extends [unknown, infer J extends number]
		? EatOp<T, J, ","> extends never
			? J
			: SkipNameList<T, Next<J>>
		: SyntaxErrorAt<T, I>;
type ParseSelectBody<T extends Toks, I extends number> =
	ParseIntersectChain<T, I> extends infer X
		? X extends Ok<infer L, infer J>
			? ParseUnionLoop<T, L, J>
			: X
		: never;

type ParseUnionLoop<T extends Toks, L, I extends number> =
	T[I] extends WordTok<infer Op extends "union" | "except">
		? ParseIntersectChain<
				T,
				SkipWord<T, Next<I>, "all" | "distinct">
			> extends infer X
			? X extends Ok<infer R, infer J>
				? ParseUnionLoop<
						T,
						SetNode<
							Op,
							EatWord<T, Next<I>, "all"> extends never ? false : true,
							L,
							R
						>,
						J
					>
				: X
			: never
		: Ok<L, I>;

type ParseIntersectChain<T extends Toks, I extends number> =
	ParseSetOperand<T, I> extends infer X
		? X extends Ok<infer L, infer J>
			? ParseIntersectLoop<T, L, J>
			: X
		: never;

type ParseIntersectLoop<T extends Toks, L, I extends number> =
	T[I] extends WordTok<"intersect">
		? ParseSetOperand<T, SkipWord<T, Next<I>, "all" | "distinct">> extends Ok<
				infer R,
				infer J
			>
			? ParseIntersectLoop<
					T,
					SetNode<
						"intersect",
						EatWord<T, Next<I>, "all"> extends never ? false : true,
						L,
						R
					>,
					J
				>
			: ParseSetOperand<T, SkipWord<T, Next<I>, "all" | "distinct">>
		: Ok<L, I>;

type ParseSetOperand<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParseSelectStmt<T, Next<I>> extends Ok<infer S, infer J>
			? Close<T, J, ParenNode<S>>
			: ParseSelectStmt<T, Next<I>>
		: T[I] extends WordTok<"select">
			? ParseSimpleSelect<T, Next<I>>
			: T[I] extends WordTok<"values">
				? ParseValues<T, Next<I>>
				: T[I] extends WordTok<"table">
					? ParseTableShorthand<T, Next<I>>
					: Expected<"SELECT, VALUES, TABLE or (", T, I>;

type ParseTableShorthand<T extends Toks, I extends number> =
	TableRelation<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? Ok<
				SimpleNode<
					false,
					[TargetNode<StarNode<null>, null>],
					[FromTableNode<RefOf<Parts>, null, null>],
					null,
					null,
					false,
					null,
					[]
				>,
				J
			>
		: TableRelation<T, I>;
type TableRelation<T extends Toks, I extends number> =
	T[I] extends WordTok<"only">
		? OnlyRelation<T, Next<I>>
		: QualName<T, I> extends [infer Parts, infer J extends number]
			? [Parts, SkipInheritanceStar<T, J>]
			: Expected<"table name", T, I>;

export type ParseValues<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[] = [],
> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExprList<T, Next<I>, []> extends Ok<infer Row, infer J>
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: EatOp<T, Next<J>, ","> extends never
					? Ok<ValuesNode<[...Acc, Row]>, Next<J>>
					: ParseValues<T, Nx2<J>, [...Acc, Row]>
			: ParseExprList<T, Next<I>, []>;

type ParseSimpleSelect<T extends Toks, I extends number> =
	ParseDistinct<T, I> extends Ok<infer Distinct, infer I1>
		? (
				Distinct extends false
					? EndsTargetList<T, I1> extends true
						? Ok<[], I1>
						: ParseTargetList<T, I1, []>
					: ParseTargetList<T, I1, []>
			) extends infer TL
			? TL extends Ok<infer Targets, infer I2>
				? ParseSimpleAfterTargets<T, I2, Distinct, Targets>
				: TL
			: never
		: ParseDistinct<T, I>;

export type ParseSimpleAfterTargets<
	T extends Toks,
	I2 extends number,
	Distinct,
	Targets,
> =
	FromAfterInto<T, I2> extends infer F
		? F extends Ok<infer From, infer I3>
			? ParseSimpleAfterFrom<T, I2, Distinct, Targets, From, I3>
			: F
		: never;

type ParseSimpleAfterFrom<
	T extends Toks,
	I2 extends number,
	Distinct,
	Targets,
	From,
	I3 extends number,
> =
	ParseWhereOpt<T, I3> extends Ok<infer Where, infer I4>
		? T[I4] extends WordTok<"group" | "having" | "window">
			? ParseSimpleClauses<T, I2, Distinct, Targets, From, Where, I4>
			: SimpleOk<
					T,
					I2,
					SimpleNode<Distinct, Targets, From, Where, null, false, null, []>,
					I4
				>
		: ParseWhereOpt<T, I3>;

type ParseSimpleClauses<
	T extends Toks,
	I2 extends number,
	Distinct,
	Targets,
	From,
	Where,
	I4 extends number,
> =
	ParseGroupByOpt<T, I4> extends Ok<[infer Group, infer Sets], infer I5>
		? ParseWhereOpt<T, I5, "having"> extends Ok<infer Having, infer I6>
			? ParseWindowClause<T, I6> extends Ok<infer Windows, infer I7>
				? SimpleOk<
						T,
						I2,
						SimpleNode<
							Distinct,
							Targets,
							From,
							Where,
							Group,
							Sets,
							Having,
							Windows
						>,
						I7
					>
				: ParseWindowClause<T, I6>
			: ParseWhereOpt<T, I5, "having">
		: ParseGroupByOpt<T, I4>;

type SimpleOk<T extends Toks, I2 extends number, N, J extends number> =
	T[I2] extends WordTok<"into">
		? Ok<N & { into: IntoRef<T, I2> }, J>
		: Ok<N, J>;

type FromAfterInto<T extends Toks, I extends number> =
	T[I] extends WordTok<"into">
		? IntoEnd<T, I> extends infer J extends number
			? ParseFromOpt<T, J>
			: IntoEnd<T, I>
		: ParseFromOpt<T, I>;

type IntoEnd<T extends Toks, I extends number> =
	SkipWord<T, SkipIntoPersistence<T, Next<I>>, "table"> extends infer K extends
		number
		? QualName<T, K> extends [unknown, infer J]
			? J
			: SyntaxErrorAt<T, K>
		: never;
export type IntoName<T extends Toks, I extends number> = SkipWord<
	T,
	SkipIntoPersistence<T, Next<I>>,
	"table"
>;
type IntoRef<T extends Toks, I extends number> =
	QualName<T, SkipWord<T, SkipIntoPersistence<T, Next<I>>, "table">> extends [
		infer Parts extends readonly string[],
		number,
	]
		? RefOf<Parts>
		: null;
type SkipIntoPersistence<T extends Toks, I extends number> =
	T[I] extends WordTok<"local" | "global">
		? T[Next<I>] extends WordTok<"temporary" | "temp">
			? Nx2<I>
			: I
		: T[I] extends WordTok<"temporary" | "temp" | "unlogged">
			? T[Next<I>] extends WordTok<"table">
				? Next<I>
				: QualName<T, Next<I>> extends null
					? I
					: Next<I>
			: I;

type ParseDistinct<T extends Toks, I extends number> =
	EatWord<T, I, "all"> extends never
		? EatWord<T, I, "distinct"> extends never
			? Ok<false, I>
			: EatWords<T, I, ["distinct", "on"]> extends never
				? Ok<true, Next<I>>
				: EatOp<T, Nx2<I>, "("> extends never
					? Expected<'"("', T, Nx2<I>>
					: ParseExprList<T, Nx3<I>, []> extends Ok<infer On, infer J>
						? Close<T, J, On>
						: ParseExprList<T, Nx3<I>, []>
		: Ok<false, Next<I>>;

type TargetEndWord =
	| "from"
	| "into"
	| "where"
	| "group"
	| "having"
	| "window"
	| "order"
	| "limit"
	| "offset"
	| "fetch"
	| "for"
	| "union"
	| "intersect"
	| "except"
	| "returning";
export type EndsTargetList<T extends Toks, I extends number> = T[I] extends
	| WordTok<TargetEndWord>
	| OpTok<")" | ";">
	| undefined
	? true
	: false;

export type ParseTargetList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	TryColumnTarget<T, I> extends infer P
		? P extends Ok<infer E, infer J>
			? ContinueTargets<T, E, J, Acc>
			: ParseTargetSlow<T, I, Acc>
		: never;

type TryColumnTarget<T extends Toks, I extends number> =
	Ident<T, I> extends [infer Name, infer J extends number]
		? T[J] extends OpTok<".">
			? AnyLabel<T, Next<J>> extends [infer Col, infer K extends number]
				? TryTargetTail<T, ColNode<Name, Col>, K>
				: T[Next<J>] extends OpTok<"*">
					? TryTargetTail<T, StarNode<Name>, Nx2<J>>
					: null
			: T[J] extends OpTok<"("> | StrTok
				? null
				: TryTargetTail<T, ColNode<null, Name>, J>
		: null;

type TryTargetTail<T extends Toks, E, I extends number> =
	IsTargetEnd<T[I]> extends true
		? Ok<TargetNode<E, null>, I>
		: ParseTargetAlias<T, I> extends [infer A, infer J extends number]
			? IsTargetEnd<T[J]> extends true
				? Ok<TargetNode<E, A>, J>
				: null
			: null;
type IsTargetEnd<H> = H extends
	| OpTok<"," | ")" | ";">
	| WordTok<TargetEndWord>
	| undefined
	? true
	: false;

type ContinueTargets<
	T extends Toks,
	E,
	I extends number,
	Acc extends readonly unknown[],
> =
	EatOp<T, I, ","> extends never
		? Ok<[...Acc, E], I>
		: ParseTargetList<T, Next<I>, [...Acc, E]>;

type ParseTargetSlow<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseExpr<T, I, "target"> extends infer X
		? X extends Ok<infer E, infer J>
			? ParseTargetAlias<T, J> extends [infer A, infer J2 extends number]
				? ContinueTargets<T, TargetNode<E, A>, J2, Acc>
				: ParseTargetAlias<T, J>
			: X
		: never;

type ParseTargetAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? AnyLabel<T, Next<I>> extends [infer V, infer J]
			? [V, J]
			: SyntaxErrorAt<T, Next<I>>
		: T[I] extends IdTok<infer V>
			? [V, Next<I>]
			: T[I] extends WordTok<infer V>
				? V extends NotBareLabel
					? [null, I]
					: [V, Next<I>]
				: [null, I];

export type ParseFromOpt<T extends Toks, I extends number> =
	EatWord<T, I, "from"> extends never
		? Ok<[], I>
		: ParseFromList<T, Next<I>, []>;

export type ParseFromList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseFromItem<T, I> extends infer X
		? X extends Ok<infer F, infer J>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, F], J>
				: ParseFromList<T, Next<J>, [...Acc, F]>
			: X
		: never;

export type ParseFromItem<T extends Toks, I extends number> =
	ParseFromPrimary<T, I> extends infer X
		? X extends Ok<infer F, infer J>
			? ParseJoins<T, F, J>
			: X
		: never;

type ParseFromPrimary<T extends Toks, I extends number> =
	T[I] extends WordTok<"lateral">
		? ParseFromPrimaryLateral<T, Next<I>, true>
		: T[I] extends WordTok<"only">
			? ParseOnlyItem<T, Next<I>>
			: ParseFromPrimaryLateral<T, I, false>;

type ParseFromPrimaryLateral<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	T[I] extends OpTok<"(">
		? IsSelectStart<T, Next<I>> extends true
			? ParseSelectStmt<T, Next<I>> extends infer X
				? X extends Ok<infer S, infer J>
					? EatOp<T, J, ")"> extends never
						? ParenJoinOr<T, I, Lateral, Expected<'")"', T, J>>
						: ParseAliasChecked<T, Next<J>> extends [
									infer A,
									infer CA,
									infer J2 extends number,
								]
							? Ok<FromSubNode<S, A, CA, Lateral>, J2>
							: ParseAliasChecked<T, Next<J>>
					: ParenJoinOr<T, I, Lateral, X>
				: never
			: Lateral extends true
				? SyntaxErrorAt<T, Next<I>>
				: ParseParenJoin<T, I>
		: T[I] extends WordTok<FromFuncWord>
			? FromSpecialFunc<T, I, Lateral>
			: T[I] extends WordTok<"json_table">
				? T[Next<I>] extends OpTok<"(">
					? ParseJsonTableItem<T, Nx2<I>>
					: ParseNamedFromItem<T, I, Lateral>
				: T[I] extends WordTok<"rows">
					? T[Next<I>] extends WordTok<"from">
						? ParseRowsFrom<T, Nx2<I>, Lateral>
						: ParseNamedFromItem<T, I, Lateral>
					: ParseNamedFromItem<T, I, Lateral>;

type ParseJsonTableItem<T extends Toks, I extends number> =
	ParseJsonTable<T, I> extends Ok<infer JT, infer J>
		? ParseAliasChecked<T, J> extends [
				infer A,
				infer CA,
				infer J2 extends number,
			]
			? Ok<FromJsonTableNode<JT, A, CA>, J2>
			: ParseAliasChecked<T, J>
		: ParseJsonTable<T, I>;

type ParseNamedFromItem<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	FuncName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? T[I] extends WordTok<"xmltable">
				? ParseXmlTable<T, Next<J>>
				: ParseFromCall<T, I, J> extends Ok<infer Call, infer J2>
					? ParseFuncAlias<T, Call, Lateral, J2>
					: ParseFromCall<T, I, J>
			: Lateral extends true
				? SyntaxErrorAt<T, J>
				: ParseTableItem<T, Parts, SkipInheritanceStar<T, J>>
		: Expected<"table name, subquery or function", T, I>;

type ParseTableItem<
	T extends Toks,
	Parts extends readonly string[],
	I extends number,
> =
	ParseAliasChecked<T, I> extends [infer A, infer CA, infer J extends number]
		? T[J] extends WordTok<"tablesample">
			? ParseTableSample<T, FromTableNode<RefOf<Parts>, A, CA>, Next<J>>
			: Ok<FromTableNode<RefOf<Parts>, A, CA>, J>
		: ParseAliasChecked<T, I>;

type ParseOnlyItem<T extends Toks, I extends number> =
	OnlyRelation<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseTableItem<T, Parts, J>
		: OnlyRelation<T, I>;
type OnlyRelation<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? QualName<T, Next<I>> extends [infer Parts, infer J extends number]
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: [Parts, Next<J>]
			: Expected<"table name", T, Next<I>>
		: QualName<T, I> extends [unknown, number]
			? QualName<T, I>
			: Expected<"table name", T, I>;

type FromFuncWord =
	| "current_date"
	| "current_time"
	| "current_timestamp"
	| "localtime"
	| "localtimestamp"
	| "current_role"
	| "current_user"
	| "session_user"
	| "system_user"
	| "user"
	| "current_catalog"
	| "current_schema"
	| "cast"
	| "collation";
type FromSpecialFunc<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	T[I] extends WordTok<"collation">
		? T[Next<I>] extends WordTok<"for">
			? FromFuncExpr<T, I, Lateral>
			: ParseNamedFromItem<T, I, Lateral>
		: FromFuncExpr<T, I, Lateral>;
type FromFuncExpr<T extends Toks, I extends number, Lateral extends boolean> =
	ParseExpr<T, I, 13> extends Ok<infer Call, infer J>
		? ParseFuncAlias<T, Call, Lateral, J>
		: ParseExpr<T, I, 13>;

type ParenJoinOr<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
	E,
> = Lateral extends true
	? E
	: T[Next<I>] extends OpTok<"(">
		? ParseParenJoin<T, I>
		: E;
type ParseParenJoin<T extends Toks, I extends number> =
	ParseFromItem<T, Next<I>> extends Ok<infer F, infer J>
		? EatOp<T, J, ")"> extends never
			? Expected<'")"', T, J>
			: F extends Tag<"join">
				? ParseParenJoinAlias<T, F, Next<J>>
				: SyntaxErrorAt<T, J>
		: ParseFromItem<T, Next<I>>;

type ParseFromCall<T extends Toks, I extends number, J extends number> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer Call, number>
			? Call extends
					| { readonly over: true }
					| { readonly filter: Expr }
					| { readonly withinGroup: Expr }
				? WindowlessError<T, Extract<SkipToCloseParen<T, Next<J>>, number>>
				: X
			: X
		: never;
type WindowlessError<T extends Toks, K extends number> = T[Next<K>] extends
	| OpTok<"(">
	| WordTok<"group">
	? SyntaxErrorAt<T, Nx2<K>>
	: SyntaxErrorAt<T, Next<K>>;

type ParseTableSample<T extends Toks, Tbl, I extends number> =
	FuncName<T, I> extends [infer M, infer J extends number]
		? EatOp<T, J, "("> extends never
			? Expected<'"("', T, J>
			: ParseExprList<T, Next<J>, []> extends Ok<infer Args, infer J2>
				? EatOp<T, J2, ")"> extends never
					? Expected<'")"', T, J2>
					: ParseRepeatable<T, Next<J2>> extends Ok<infer Rep, infer J3>
						? Ok<
								{
									t: "sample";
									table: Tbl;
									method: M extends readonly [...string[], infer L] ? L : never;
									args: Args;
									repeatable: Rep;
								},
								J3
							>
						: ParseRepeatable<T, Next<J2>>
				: ParseExprList<T, Next<J>, []>
		: Expected<"tablesample method", T, I>;
type ParseRepeatable<T extends Toks, I extends number> =
	EatWord<T, I, "repeatable"> extends never
		? Ok<null, I>
		: EatOp<T, Next<I>, "("> extends never
			? Expected<'"("', T, Next<I>>
			: ParseExpr<T, Nx2<I>, 0> extends Ok<infer E, infer J>
				? Close<T, J, E>
				: ParseExpr<T, Nx2<I>, 0>;

type ParseRowsFrom<T extends Toks, I extends number, Lateral extends boolean> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseRowsFromItems<T, Next<I>, []> extends Ok<infer Funcs, infer J>
			? ParseFuncAlias<T, null, Lateral, J> extends Ok<
					{
						readonly alias: infer A;
						readonly colAliases: infer CA;
						readonly colDefs: infer CD;
						readonly withOrdinality: infer Ord;
					},
					infer J2
				>
				? Ok<FromRowsNode<Funcs, A, CA, CD, Lateral, Ord>, J2>
				: ParseFuncAlias<T, null, Lateral, J>
			: ParseRowsFromItems<T, Next<I>, []>;
type ParseRowsFromItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	FuncName<T, I> extends [unknown, infer J extends number]
		? T[J] extends OpTok<"(">
			? ParseFromCall<T, I, J> extends Ok<infer Call, infer J2>
				? ParseItemColDefs<T, J2> extends Ok<infer Defs, infer J3>
					? EatOp<T, J3, ","> extends never
						? EatOp<T, J3, ")"> extends never
							? Expected<'"," or ")"', T, J3>
							: Ok<[...Acc, FromRowNode<Call, Defs>], Next<J3>>
						: ParseRowsFromItems<T, Next<J3>, [...Acc, FromRowNode<Call, Defs>]>
					: ParseItemColDefs<T, J2>
				: ParseFromCall<T, I, J>
			: Expected<'"("', T, J>
		: Expected<"function call", T, I>;
type ParseItemColDefs<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? T[Next<I>] extends OpTok<"(">
			? ParseColDefs<T, Nx2<I>, []>
			: Expected<'"("', T, Next<I>>
		: Ok<null, I>;

type ParseParenJoinAlias<T extends Toks, F, I extends number> =
	ParseAliasChecked<T, I> extends infer A
		? A extends [infer Al extends string, infer CA, infer J extends number]
			? Ok<
					FromSubNode<
						SelectNode<
							null,
							SimpleNode<
								false,
								[TargetNode<StarNode<null>, null>],
								[F],
								null,
								null,
								false,
								null,
								[]
							>,
							[],
							null,
							null
						>,
						Al,
						CA,
						true
					>,
					J
				>
			: A extends [null, null, infer J extends number]
				? Ok<F, J>
				: A
		: never;

type SkipInheritanceStar<T extends Toks, I extends number> =
	T[I] extends OpTok<"*"> ? Next<I> : I;

export type RefOf<Parts extends readonly string[]> = Parts extends readonly [
	infer N,
]
	? RefNode<null, N>
	: Parts extends readonly [infer S, infer N]
		? RefNode<S, N>
		: Parts extends readonly [string, infer S, infer N]
			? RefNode<S, N>
			: never;

type ParseFuncAlias<
	T extends Toks,
	Call,
	Lateral extends boolean,
	I extends number,
> =
	SkipOrdinality<T, I> extends [
		infer Ord extends boolean,
		infer I1 extends number,
	]
		? T[I1] extends WordTok<"as">
			? T[Next<I1>] extends OpTok<"(">
				? Ord extends true
					? Fail<
							"WITH ORDINALITY cannot be used with a column definition list",
							Next<I1>
						>
					: ParseColDefs<T, Nx2<I1>, []> extends Ok<infer Defs, infer J>
						? Ok<FromFuncNode<Call, null, null, Defs, Lateral, Ord>, J>
						: ParseColDefs<T, Nx2<I1>, []>
				: ParseFuncAliasNamed<T, Call, Lateral, Ord, I1>
			: ParseFuncAliasNamed<T, Call, Lateral, Ord, I1>
		: never;
type ParseFuncAliasNamed<
	T extends Toks,
	Call,
	Lateral extends boolean,
	Ord extends boolean,
	I extends number,
> =
	ParseAliasChecked<T, I, true> extends [
		infer A,
		infer CA,
		infer J extends number,
	]
		? [A, CA, T[J]] extends [string, null, OpTok<"(">]
			? Ord extends true
				? Fail<
						"WITH ORDINALITY cannot be used with a column definition list",
						J
					>
				: ParseColDefs<T, Next<J>, []> extends Ok<infer Defs, infer J2>
					? Ok<FromFuncNode<Call, A, null, Defs, Lateral, Ord>, J2>
					: ParseColDefs<T, Next<J>, []>
			: Ok<FromFuncNode<Call, A, CA, null, Lateral, Ord>, J>
		: ParseAliasChecked<T, I, true>;
type SkipOrdinality<T extends Toks, I extends number> =
	EatWords<T, I, ["with", "ordinality"]> extends never
		? [false, I]
		: [true, Nx2<I>];

type ParseColDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer N, infer J extends number]
		? ParseTypeName<T, J> extends Ok<infer Ty, infer J2>
			? EatOp<T, J2, ","> extends never
				? EatOp<T, J2, ")"> extends never
					? Expected<'"," or ")"', T, J2>
					: Ok<[...Acc, ColDefNode<N, Ty>], Next<J2>>
				: ParseColDefs<T, Next<J2>, [...Acc, ColDefNode<N, Ty>]>
			: ParseTypeName<T, J>
		: Expected<"column definition", T, I>;

export type ParseAliasChecked<
	T extends Toks,
	I extends number,
	Fn extends boolean = false,
> =
	T[I] extends WordTok<"as">
		? Ident<T, Next<I>> extends [infer A extends string, infer J extends number]
			? ParseColAliases<T, A, J, Fn>
			: SyntaxErrorAt<T, Next<I>>
		: Ident<T, I> extends [infer A extends string, infer J extends number]
			? ParseColAliases<T, A, J, Fn>
			: [null, null, I];
type ParseColAliases<
	T extends Toks,
	A extends string,
	I extends number,
	Fn extends boolean,
> =
	T[I] extends OpTok<"(">
		? Fn extends true
			? Ident<T, Next<I>> extends [string, infer J extends number]
				? T[J] extends OpTok<"," | ")">
					? ParenAliases<T, A, I>
					: [A, null, I]
				: [A, null, I]
			: ParenAliases<T, A, I>
		: [A, null, I];
type ParenAliases<T extends Toks, A extends string, I extends number> =
	ParenIdentList<T, I> extends Ok<infer Cols, infer J>
		? [A, Cols, J]
		: ParenIdentList<T, I>;

type ParseJoins<T extends Toks, L, I extends number> =
	T[I] extends WordTok<"cross">
		? T[Next<I>] extends WordTok<"join">
			? ParseJoinRhs<T, L, "cross", false, Nx2<I>>
			: Expected<"JOIN", T, Next<I>>
		: T[I] extends WordTok<"natural">
			? ParseJoinKind<T, Next<I>> extends infer R
				? R extends [infer K extends JoinKind, infer J extends number]
					? ParseJoinRhs<T, L, K, true, J>
					: R extends null
						? Expected<"JOIN", T, Next<I>>
						: R
				: never
			: ParseJoinKind<T, I> extends infer R
				? R extends [infer K extends JoinKind, infer J extends number]
					? ParseJoinRhs<T, L, K, false, J>
					: R extends null
						? Ok<L, I>
						: R
				: never;

type ParseJoinKind<T extends Toks, I extends number> =
	T[I] extends WordTok<"join">
		? ["inner", Next<I>]
		: T[I] extends WordTok<"inner">
			? JoinWord<T, "inner", Next<I>>
			: T[I] extends WordTok<infer K extends "left" | "right" | "full">
				? JoinWord<T, K, SkipWord<T, Next<I>, "outer">>
				: null;
type JoinWord<T extends Toks, K extends JoinKind, I extends number> =
	T[I] extends WordTok<"join"> ? [K, Next<I>] : Expected<"JOIN", T, I>;

type ParseJoinRhs<
	T extends Toks,
	L,
	K extends JoinKind,
	Natural extends boolean,
	I extends number,
> =
	ParseFromPrimary<T, I> extends Ok<infer Rt, infer J>
		? K extends "cross"
			? UnqualifiedJoin<T, L, K, Rt, Natural, J>
			: Natural extends true
				? UnqualifiedJoin<T, L, K, Rt, Natural, J>
				: ParseJoins<T, Rt, J> extends Ok<infer Rt2, infer J2>
					? ParseJoinQual<T, L, K, Rt2, J2>
					: ParseJoins<T, Rt, J>
		: ParseFromPrimary<T, I>;
type UnqualifiedJoin<
	T extends Toks,
	L,
	K extends JoinKind,
	Rt,
	Natural extends boolean,
	J extends number,
> = ParseJoins<T, JoinNode<K, L, Rt, null, null, Natural>, J>;
type ParseJoinQual<
	T extends Toks,
	L,
	K extends JoinKind,
	Rt,
	J extends number,
> =
	EatWord<T, J, "on"> extends never
		? EatWord<T, J, "using"> extends never
			? Expected<"ON or USING", T, J>
			: ParenIdentList<T, Next<J>> extends Ok<infer Cols, infer J2>
				? SkipUsingAlias<T, J2> extends infer J3 extends number
					? ParseJoins<T, JoinNode<K, L, Rt, null, Cols, false>, J3>
					: SkipUsingAlias<T, J2>
				: ParenIdentList<T, Next<J>>
		: ParseExpr<T, Next<J>, 0> extends Ok<infer Cond, infer J2>
			? ParseJoins<T, JoinNode<K, L, Rt, Cond, null, false>, J2>
			: ParseExpr<T, Next<J>, 0>;
type SkipUsingAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? Ident<T, Next<I>> extends [string, infer J]
			? J
			: SyntaxErrorAt<T, Next<I>>
		: I;

export type ParseWhereOpt<
	T extends Toks,
	I extends number,
	W extends string = "where",
> = EatWord<T, I, W> extends never ? Ok<null, I> : ParseExpr<T, Next<I>, 0>;

type ParseGroupByOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["group", "by"]> extends never
		? Ok<[null, false], I>
		: ParseGroupItems<T, SkipWord<T, Nx2<I>, "all" | "distinct">, [], false>;

type ParseGroupItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	T[I] extends WordTok<"rollup" | "cube">
		? T[Next<I>] extends OpTok<"(">
			? ParseExprList<T, Nx2<I>, []> extends Ok<
					infer Items extends readonly unknown[],
					infer J
				>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: GroupNext<
							T,
							Next<J>,
							[...Acc, ...Items],
							Sets extends true
								? true
								: [...(Sets extends readonly unknown[] ? Sets : []), ...Items]
						>
				: ParseExprList<T, Nx2<I>, []>
			: ParseGroupExpr<T, I, Acc, Sets>
		: T[I] extends WordTok<"grouping">
			? T[Next<I>] extends WordTok<"sets">
				? T[Nx2<I>] extends OpTok<"(">
					? SkipToCloseParen<T, Nx3<I>> extends infer J extends number
						? GroupNext<T, J, Acc, true>
						: SkipToCloseParen<T, Nx3<I>>
					: Expected<'"("', T, Nx2<I>>
				: ParseGroupExpr<T, I, Acc, Sets>
			: T[I] extends OpTok<"(">
				? T[Next<I>] extends OpTok<")">
					? GroupNext<T, Nx2<I>, Acc, true>
					: ParseGroupExpr<T, I, Acc, Sets>
				: ParseGroupExpr<T, I, Acc, Sets>;
type GroupSets = boolean | readonly unknown[];
type ParseGroupExpr<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? GroupNext<T, J, [...Acc, E], Sets>
		: ParseExpr<T, I, 0>;
type GroupNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	EatOp<T, I, ","> extends never
		? Ok<[Acc, Sets], I>
		: ParseGroupItems<T, Next<I>, Acc, Sets>;

type ParseWindowClause<T extends Toks, I extends number> =
	T[I] extends WordTok<"window"> ? ParseWindowDefs<T, Next<I>, []> : Ok<[], I>;
type ParseWindowDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer Name, infer J extends number]
		? EatWord<T, J, "as"> extends never
			? Expected<"AS", T, J>
			: EatOp<T, Next<J>, "("> extends never
				? Expected<'"("', T, Next<J>>
				: ParseWindowSpec<T, Nx2<J>> extends Ok<infer Spec, infer J2>
					? EatOp<T, J2, ","> extends never
						? Ok<[...Acc, WindowNode<Name, Spec>], J2>
						: ParseWindowDefs<T, Next<J2>, [...Acc, WindowNode<Name, Spec>]>
					: ParseWindowSpec<T, Nx2<J>>
		: Expected<"window name", T, I>;

export type ParseWith<T extends Toks, I extends number> =
	EatWord<T, I, "recursive"> extends never
		? ParseCtes<T, I, [], false>
		: ParseCtes<T, Next<I>, [], true>;

type ParseCtes<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Rec extends boolean,
> =
	Ident<T, I> extends [infer Name, infer J extends number]
		? ParseCteCols<T, J> extends Ok<infer Cols, infer J2>
			? EatWord<T, J2, "as"> extends never
				? Expected<"AS", T, J2>
				: EatOp<T, SkipMaterialized<T, Next<J2>>, "("> extends never
					? Expected<'"("', T, SkipMaterialized<T, Next<J2>>>
					: ParseStatement<
								T,
								Next<SkipMaterialized<T, Next<J2>>>,
								false
							> extends infer X
						? X extends Ok<infer S, infer J3>
							? EatOp<T, J3, ")"> extends never
								? Expected<'")"', T, J3>
								: ParseSearchCycle<T, Next<J3>> extends Ok<
											[infer Search, infer Cycle],
											infer J4
										>
									? CteNext<
											T,
											J4,
											[...Acc, CteNode<Name, Cols, S, Search, Cycle>],
											Rec
										>
									: ParseSearchCycle<T, Next<J3>>
							: X
						: never
			: ParseCteCols<T, J>
		: Expected<"CTE name", T, I>;
type CteNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Rec extends boolean,
> =
	EatOp<T, I, ","> extends never
		? Ok<WithNode<Rec, Acc>, I>
		: ParseCtes<T, Next<I>, Acc, Rec>;
type ParseCteCols<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? ParenIdentList<T, I> : Ok<null, I>;
type SkipMaterialized<T extends Toks, I extends number> =
	EatWords<T, I, ["not", "materialized"]> extends never
		? SkipWord<T, I, "materialized">
		: Nx2<I>;

type ParseSearchCycle<T extends Toks, I extends number> =
	ParseCteSearch<T, I> extends Ok<infer Search, infer J>
		? ParseCteCycle<T, J> extends Ok<infer Cycle, infer J2>
			? Ok<[Search, Cycle], J2>
			: ParseCteCycle<T, J>
		: ParseCteSearch<T, I>;
type ParseCteSearch<T extends Toks, I extends number> =
	T[I] extends WordTok<"search">
		? T[Next<I>] extends WordTok<infer D extends "depth" | "breadth">
			? EatWords<T, Nx2<I>, ["first", "by"]> extends never
				? Expected<"FIRST BY", T, Nx2<I>>
				: ParseColIdList<T, Nx2<Nx2<I>>, []> extends Ok<infer Cols, infer J>
					? ParseSetCol<T, J> extends Ok<infer Set, infer J2>
						? Ok<
								{
									breadth: D extends "breadth" ? true : false;
									cols: Cols;
									set: Set;
								},
								J2
							>
						: ParseSetCol<T, J>
					: ParseColIdList<T, Nx2<Nx2<I>>, []>
			: Expected<"DEPTH or BREADTH", T, Next<I>>
		: Ok<null, I>;
type ParseCteCycle<T extends Toks, I extends number> =
	T[I] extends WordTok<"cycle">
		? ParseColIdList<T, Next<I>, []> extends Ok<infer Cols, infer J>
			? ParseSetCol<T, J> extends Ok<infer Mark, infer J2>
				? T[J2] extends WordTok<"to">
					? ParseCycleConst<T, Next<J2>> extends Ok<infer To, infer J3>
						? EatWord<T, J3, "default"> extends never
							? Expected<"DEFAULT", T, J3>
							: ParseCycleConst<T, Next<J3>> extends Ok<infer Def, infer J4>
								? ParseCycleUsing<T, J4, Cols, Mark, To, Def>
								: ParseCycleConst<T, Next<J3>>
						: ParseCycleConst<T, Next<J2>>
					: ParseCycleUsing<T, J2, Cols, Mark, null, null>
				: ParseSetCol<T, J>
			: ParseColIdList<T, Next<I>, []>
		: Ok<null, I>;
type ParseCycleUsing<T extends Toks, I extends number, Cols, Mark, To, Def> =
	EatWord<T, I, "using"> extends never
		? Expected<"USING", T, I>
		: Ident<T, Next<I>> extends [infer P, infer J extends number]
			? Ok<{ cols: Cols; set: Mark; to: To; default: Def; using: P }, J>
			: Expected<"column name", T, Next<I>>;
type ParseCycleConst<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? SyntaxErrorAt<T, I>
		: ParseExpr<T, I, 13> extends infer X
			? X extends Ok<infer E, infer J>
				? E extends Tag<"num" | "str" | "bool" | "null" | "typed">
					? X
					: FuncName<T, I> extends null
						? SyntaxErrorAt<T, I>
						: SyntaxErrorAt<T, J>
				: X
			: never;
type ParseSetCol<T extends Toks, I extends number> =
	EatWord<T, I, "set"> extends never
		? Expected<"SET", T, I>
		: Ident<T, Next<I>> extends [infer N, infer J extends number]
			? Ok<N, J>
			: Expected<"column name", T, Next<I>>;
type ParseColIdList<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, N], J>
			: ParseColIdList<T, Next<J>, [...Acc, N]>
		: Expected<"column name", T, I>;
