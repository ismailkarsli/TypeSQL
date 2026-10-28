import type {
	Cte,
	Expr,
	FromItem,
	JoinKind,
	SelectBody,
	Target,
} from "../ast.js";
import type { IdTok, OpTok, StrTok, Toks, WordTok } from "../lexer/tokens.js";
import type {
	ColNode,
	ParseExpr,
	ParseExprList,
	ParseOrderList,
	ParseWindowSpec,
} from "./expr.js";
import type { ParseJsonTable } from "./json.js";
import type { NotBareLabel } from "./keywords.js";
import type { ParseStatement } from "./stmt.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	FuncName,
	Ident,
	Nx,
	Ok,
	ParenIdentList,
	QualName,
	SkipToCloseParen,
	SkipWord,
	SkipWords,
	SyntaxErrorAt,
} from "./util.js";
import type { ParseXmlTable } from "./xml.js";

/**
 * SELECT parser (index-based, see util.ts). Parse results are matched with
 * unconstrained `infer` (`Ok<infer Body, infer J>`; `J` is a number by `Ok`'s own constraint):
 * constraining the inferred node against a recursive AST type walks the whole subtree (ENGINE.md
 * pitfall 12). Nodes are discriminated on `t` only.
 */

/** Canonical nodes share semantic work across statements and fragment alternatives. */
export type SelectNode<W, Body, Order, Lim, Off> = {
	t: "select";
	with: W;
	body: Body;
	orderBy: Order;
	limit: Lim;
	offset: Off;
};
export type SimpleNode<D, Ts, Fs, W, G, Sets, H, Wins> = {
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
type SimpleIntoNode<D, Ts, Fs, W, G, Sets, H, Wins, Into> = {
	t: "simple";
	distinct: D;
	targets: Ts;
	from: Fs;
	where: W;
	groupBy: G;
	groupingSets: Sets;
	having: H;
	windows: Wins;
	into: Into;
};
export type TargetNode<E, A> = { e: E; alias: A };
export type StarNode<Tbl> = { t: "star"; tbl: Tbl };
export type FromTableNode<Ref, A, CA> = {
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

/** True if token `I` starts a SELECT-like statement (possibly parenthesized). */
export type IsSelectStart<T extends Toks, I extends number> =
	T[I] extends WordTok<"select" | "with" | "values" | "table">
		? true // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
		: T[I] extends OpTok<"(">
			? IsSelectStart<T, Nx<I>>
			: false;

/** `[WITH ...] body [ORDER BY ...] [LIMIT ...] [OFFSET ...] [FOR UPDATE ...]` */
export type ParseSelectStmt<T extends Toks, I extends number> =
	EatWord<T, I, "with"> extends never
		? ParseSelectAfterWith<T, I, null>
		: ParseWith<T, EatWord<T, I, "with">> extends infer W
			? W extends Ok<infer Wc, infer J>
				? ParseSelectAfterWith<T, J, Wc>
				: W
			: never;

export type ParseSelectAfterWith<T extends Toks, I extends number, W> =
	ParseSelectBody<T, I> extends infer B
		? B extends Ok<infer Body, infer J>
			? ParseSelectTail<T, Body, W, J>
			: B
		: never;

/**
 * `[ORDER BY ...] [locking] [LIMIT/OFFSET/FETCH ...] [locking]`. Postgres accepts the
 * locking clause before or after LIMIT, not both; it is rejected on set operations.
 */
export type ParseSelectTail<T extends Toks, Body, W, I extends number> =
	ParseOrderByOpt<T, I> extends infer O
		? O extends Ok<infer Order, infer J>
			? ParseOrderedTail<T, Body, W, Order, J>
			: O
		: never;

type ParseOrderedTail<T extends Toks, Body, W, Order, J extends number> =
	LockingClause<T, J> extends infer K
		? K extends [infer K1 extends number, infer Locks1]
			? ParseLockedTail<T, Body, W, Order, J, K1, Locks1>
			: K
		: never;

type ParseLockedTail<
	T extends Toks,
	Body,
	W,
	Order,
	J extends number,
	K1 extends number,
	Locks1,
> =
	ParseLimitOffset<T, K1, null, null, null> extends infer L
		? L extends Ok<[infer Lim, infer Off, infer Ties], infer J2>
			? ParseLimitedTail<T, Body, W, Order, J, K1, Locks1, Lim, Off, Ties, J2>
			: L
		: never;

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
> = (K1 extends J ? LockingClause<T, J2> : [J2, false]) extends infer K2
	? K2 extends [infer K3 extends number, infer Locks2]
		? TailError<Body, Order, Ties, Locks1, Locks2, J, J2> extends infer E
			? [E] extends [never]
				? Ok<SelectNode<W, Body, Order, Lim, Off>, K3>
				: E
			: never
		: K2
	: never;

/**
 * The error of a statement's tail, or never: WITH TIES (at `Ties`) without an ORDER BY, a locking
 * clause on a set operation (at `J` before LIMIT, at `J2` after it).
 */
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
/** Whether a query body is a set operation, in parentheses or not. */
type IsSetOp<Body> = Body extends { readonly t: "setop" }
	? true // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
	: Body extends { readonly t: "paren"; readonly q: { readonly body: infer B } }
		? IsSetOp<B>
		: false;
/** Whether the statement has an ORDER BY: its own, or that of the parenthesized query it is. */
type HasOrderBy<Order, Body> = Order extends readonly []
	? Body extends {
			readonly t: "paren";
			readonly q: { readonly orderBy: infer O; readonly body: infer B };
		}
		? HasOrderBy<O, B>
		: false
	: true; // type-mutate: equivalent never-false – read with `extends true`, where never counts as true

export type ParseOrderByOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? Ok<[], I>
		: ParseOrderList<T, EatWords<T, I, ["order", "by"]>>;

/**
 * LIMIT / OFFSET / FETCH: one of LIMIT and FETCH and one OFFSET, in either order (`Seen`: the
 * clauses read, `"limit"` for FETCH too; a second one is a syntax error) → `Ok<[limit, offset,
 * ties], next>`, `ties` the index of a FETCH's WITH TIES (else null).
 */
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
			: ParseExpr<T, Nx<I>, 0> extends infer X
				? X extends Ok<infer E, infer J>
					? ParseLimitOffset<
							T,
							SkipWord<T, J, "row" | "rows">,
							Lim,
							E,
							Ties,
							Seen | "offset"
						>
					: X
				: never
		: T[I] extends WordTok<"limit" | "fetch">
			? "limit" extends Seen
				? SyntaxErrorAt<T, I>
				: (
							T[I] extends WordTok<"fetch">
								? ParseFetch<T, Nx<I>>
								: ParseLimit<T, I>
						) extends infer X
					? X extends Ok<[infer E, infer Ti], infer J>
						? ParseLimitOffset<T, J, E, Off, Ti, Seen | "limit">
						: X
					: never
			: Ok<[Lim, Off, Ties], I>;
/** `LIMIT {n | ALL}` at `I` → `Ok<[n | null, null], next>`; `LIMIT n, m` is an error. */
type ParseLimit<T extends Toks, I extends number> = (
	EatWord<T, Nx<I>, "all"> extends never
		? ParseExpr<T, Nx<I>, 0>
		: Ok<null, Nx<Nx<I>>>
) extends infer X
	? X extends Ok<infer E, infer J>
		? T[J] extends OpTok<",">
			? Fail<"LIMIT #,# syntax is not supported", I>
			: Ok<[E, null], J>
		: X
	: never;
/**
 * After FETCH: `{FIRST | NEXT} [n] {ROW | ROWS} {ONLY | WITH TIES}` → `Ok<[n, ties], next>`
 * (`n` 1 when left out; `ties` the index of WITH TIES, else null).
 */
type ParseFetch<T extends Toks, I extends number> =
	EatWord<T, I, "first" | "next"> extends never
		? Expected<"FIRST or NEXT", T, I>
		: (
					EatWord<T, Nx<I>, "row" | "rows"> extends never
						? ParseExpr<T, Nx<I>, 0>
						: Ok<{ t: "num"; v: "1" }, Nx<I>>
				) extends infer X
			? X extends Ok<infer E, infer J>
				? EatWord<T, J, "row" | "rows"> extends never
					? SyntaxErrorAt<T, J>
					: T[Nx<J>] extends WordTok<"only">
						? Ok<[E, null], Nx<Nx<J>>>
						: EatWords<T, Nx<J>, ["with", "ties"]> extends never
							? SyntaxErrorAt<T, Nx<J>>
							: Ok<[E, Nx<J>], EatWords<T, Nx<J>, ["with", "ties"]>>
				: X
			: never;

/**
 * `for_locking_clause` at `I`: `[next, locks]`, `[I, false]` without one, or an error. FOR READ
 * ONLY locks nothing; `SkipLocking` reads the other form,
 * `FOR UPDATE | NO KEY UPDATE | SHARE | KEY SHARE [OF t, ...] [NOWAIT | SKIP LOCKED]` repeated:
 * the index after them, or the error of an OF without a name list.
 * A FOR without a lock strength is left to fail (`SELECT 1 for`).
 */
type LockingClause<T extends Toks, I extends number> =
	EatWords<T, I, ["for", "read", "only"]> extends never
		? SkipLocking<T, I> extends infer K
			? K extends number
				? [K, K extends I ? false : true]
				: K
			: never
		: [EatWords<T, I, ["for", "read", "only"]>, false];
type SkipLocking<T extends Toks, I extends number> =
	EatWord<T, I, "for"> extends never
		? I
		: SkipLockStrength<T, Nx<I>> extends Nx<I>
			? I
			: SkipLockOf<T, SkipLockStrength<T, Nx<I>>> extends infer J
				? J extends number
					? SkipLocking<T, SkipLockWait<T, J>>
					: J
				: never;
type SkipLockStrength<T extends Toks, I extends number> =
	EatWord<T, I, "update" | "share"> extends never
		? EatWords<T, I, ["no", "key", "update"]> extends never
			? SkipWords<T, I, ["key", "share"]>
			: EatWords<T, I, ["no", "key", "update"]>
		: EatWord<T, I, "update" | "share">;
type SkipLockOf<T extends Toks, I extends number> =
	EatWord<T, I, "of"> extends never ? I : SkipNameList<T, EatWord<T, I, "of">>;
type SkipNameList<T extends Toks, I extends number> =
	QualName<T, I> extends [unknown, infer J extends number]
		? EatOp<T, J, ","> extends never
			? J
			: SkipNameList<T, EatOp<T, J, ",">>
		: SyntaxErrorAt<T, I>;
type SkipLockWait<T extends Toks, I extends number> =
	EatWord<T, I, "nowait"> extends never
		? SkipWords<T, I, ["skip", "locked"]>
		: EatWord<T, I, "nowait">;

// ───────────────────────────── set operations ─────────────────────────────

/**
 * `operand (INTERSECT operand)* ((UNION | EXCEPT) operand (INTERSECT operand)*)*`
 * INTERSECT binds tighter than UNION/EXCEPT; all are left-associative.
 */
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
				SkipWord<T, Nx<I>, "all" | "distinct">
			> extends infer X
			? X extends Ok<infer R, infer J>
				? ParseUnionLoop<
						T,
						SetNode<
							Op,
							EatWord<T, Nx<I>, "all"> extends never ? false : true,
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
		? ParseSetOperand<T, SkipWord<T, Nx<I>, "all" | "distinct">> extends infer X
			? X extends Ok<infer R, infer J>
				? ParseIntersectLoop<
						T,
						SetNode<
							"intersect",
							EatWord<T, Nx<I>, "all"> extends never ? false : true,
							L,
							R
						>,
						J
					>
				: X
			: never
		: Ok<L, I>;

type ParseSetOperand<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParseSelectStmt<T, Nx<I>> extends infer X
			? X extends Ok<infer S, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<ParenNode<S>, EatOp<T, J, ")">>
				: X
			: never
		: T[I] extends WordTok<"select">
			? ParseSimpleSelect<T, Nx<I>>
			: T[I] extends WordTok<"values">
				? ParseValues<T, Nx<I>>
				: T[I] extends WordTok<"table">
					? ParseTableShorthand<T, Nx<I>>
					: Expected<"SELECT, VALUES, TABLE or (", T, I>;

/** `TABLE [ONLY] name` ≡ `SELECT * FROM name`, after TABLE. */
type ParseTableShorthand<T extends Toks, I extends number> =
	TableRelation<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? Ok<
				SimpleNode<
					false, // type-mutate: equivalent bool-flip – TABLE is SELECT *: DISTINCT changes no type, and its ORDER BY rule is not checked after a star
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
/** `relation_expr`: `name [*]`, `ONLY name` or `ONLY (name)` → `[parts, next]`, or an error. */
type TableRelation<T extends Toks, I extends number> =
	T[I] extends WordTok<"only">
		? OnlyRelation<T, Nx<I>>
		: QualName<T, I> extends [infer Parts, infer J extends number]
			? [Parts, SkipInheritanceStar<T, J>]
			: Expected<"table name", T, I>;

/** After `VALUES`. */
export type ParseValues<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[] = [],
> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseExprList<T, EatOp<T, I, "(">, []> extends infer X
			? X extends Ok<infer Row, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: EatOp<T, EatOp<T, J, ")">, ","> extends never
						? Ok<ValuesNode<[...Acc, Row]>, EatOp<T, J, ")">>
						: ParseValues<T, EatOp<T, EatOp<T, J, ")">, ",">, [...Acc, Row]>
				: X
			: never;

// ───────────────────────────── simple select ─────────────────────────────

/** After `SELECT`. */
type ParseSimpleSelect<T extends Toks, I extends number> =
	ParseDistinct<T, I> extends infer D
		? D extends Ok<infer Distinct, infer I1>
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
			: D
		: never;

/** Parse the FROM and condition clauses after a previously parsed SELECT target list. */
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
	ParseWhereOpt<T, I3> extends infer Wh
		? Wh extends Ok<infer Where, infer I4>
			? ParseGroupByOpt<T, I4> extends infer G
				? G extends Ok<[infer Group, infer Sets], infer I5>
					? ParseSimpleAfterGroup<
							T,
							I2,
							Distinct,
							Targets,
							From,
							Where,
							Group,
							Sets,
							I5
						>
					: G
				: never
			: Wh
		: never;

type ParseSimpleAfterGroup<
	T extends Toks,
	I2 extends number,
	Distinct,
	Targets,
	From,
	Where,
	Group,
	Sets,
	I5 extends number,
> =
	ParseHavingOpt<T, I5> extends infer Hv
		? Hv extends Ok<infer Having, infer I6>
			? ParseWindowClause<T, I6> extends infer Wn
				? Wn extends Ok<infer Windows, infer I7>
					? T[I2] extends WordTok<"into">
						? Ok<
								SimpleIntoNode<
									Distinct,
									Targets,
									From,
									Where,
									Group,
									Sets,
									Having,
									Windows,
									IntoRef<T, I2>
								>,
								I7
							>
						: Ok<
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
					: Wn
				: never
			: Hv
		: never;

/** The FROM clause after the target list (at `I`), past a SELECT INTO clause there. */
type FromAfterInto<T extends Toks, I extends number> =
	T[I] extends WordTok<"into">
		? IntoEnd<T, I> extends infer J extends number
			? ParseFromOpt<T, J>
			: IntoEnd<T, I>
		: ParseFromOpt<T, I>;

/**
 * SELECT INTO: `INTO [TEMPORARY | TEMP | LOCAL … | GLOBAL … | UNLOGGED] [TABLE] name` at token `I`.
 * The simple-select node then has an `into` field (only then: common queries pay one check).
 * `IntoEnd`: the index after the clause, or an error without a name; `IntoRef`: the table.
 */
type IntoEnd<T extends Toks, I extends number> =
	SkipWord<T, SkipIntoPersistence<T, Nx<I>>, "table"> extends infer K extends
		number
		? QualName<T, K> extends [unknown, infer J]
			? J
			: SyntaxErrorAt<T, K>
		: never;
/** The name after `INTO [TEMP | UNLOGGED | …] [TABLE]`; `I` is the index of INTO. */
export type IntoName<T extends Toks, I extends number> = SkipWord<
	T,
	SkipIntoPersistence<T, Nx<I>>,
	"table"
>;
type IntoRef<T extends Toks, I extends number> =
	QualName<T, SkipWord<T, SkipIntoPersistence<T, Nx<I>>, "table">> extends [
		infer Parts extends readonly string[],
		number,
	]
		? RefOf<Parts>
		: null; // type-mutate: equivalent never-false – FromAfterInto rejects an INTO without a name first
/**
 * Past `TEMPORARY | TEMP | UNLOGGED | LOCAL TEMP… | GLOBAL TEMP…` at `I`. Not followed by TABLE
 * or a name, TEMPORARY, TEMP and UNLOGGED are the table's name (`SELECT 1 INTO temp`).
 */
type SkipIntoPersistence<T extends Toks, I extends number> =
	T[I] extends WordTok<"local" | "global">
		? T[Nx<I>] extends WordTok<"temporary" | "temp">
			? Nx<Nx<I>>
			: I
		: T[I] extends WordTok<"temporary" | "temp" | "unlogged">
			? T[Nx<I>] extends WordTok<"table">
				? Nx<I>
				: QualName<T, Nx<I>> extends null
					? I
					: Nx<I>
			: I;

type ParseDistinct<T extends Toks, I extends number> =
	EatWord<T, I, "all"> extends never
		? EatWord<T, I, "distinct"> extends never
			? Ok<false, I>
			: EatWords<T, I, ["distinct", "on"]> extends never
				? Ok<true, EatWord<T, I, "distinct">>
				: EatOp<T, EatWords<T, I, ["distinct", "on"]>, "("> extends never
					? Expected<'"("', T, EatWords<T, I, ["distinct", "on"]>>
					: ParseExprList<
								T,
								EatOp<T, EatWords<T, I, ["distinct", "on"]>, "(">,
								[]
							> extends infer X
						? X extends Ok<infer On, infer J>
							? EatOp<T, J, ")"> extends never
								? Expected<'")"', T, J>
								: Ok<On, EatOp<T, J, ")">>
							: X
						: never
		: Ok<false, EatWord<T, I, "all">>;

/**
 * Whether the token at `I` ends a target list. Right after SELECT it is an empty one: `SELECT FROM
 * t`, `EXISTS (SELECT FROM ...)` (a zero-column row; not after DISTINCT).
 */
export type EndsTargetList<T extends Toks, I extends number> = T[I] extends
	| WordTok<
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
			| "returning"
	  >
	| OpTok<")" | ";">
	| undefined
	? true // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
	: false;

/** Target list: `expr [AS alias | bare_alias] , ...` */
export type ParseTargetList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	TryColumnTarget<T, I> extends infer P
		? P extends Ok<infer E, infer J> // type-mutate: equivalent cond-false – declining the shortcut uses the identical general target parser
			? ContinueTargets<T, E, J, Acc>
			: ParseTargetSlow<T, I, Acc>
		: never;

/** Ordinary column targets can bypass expression precedence and call parsing. */
type TryColumnTarget<T extends Toks, I extends number> =
	Ident<T, I> extends [infer Name, infer J extends number] // type-mutate: equivalent cond-false tuple-swap – Ident returns [string, number]; a failed match uses the general target parser
		? T[J] extends OpTok<"."> // type-mutate: equivalent cond-false – a qualified name then fails TryTargetTail and uses the general target parser
			? AnyLabel<T, Nx<J>> extends [infer Col, infer K extends number] // type-mutate: equivalent cond-false tuple-swap – labels return [string, number]; a failed match uses the general target parser
				? TryTargetTail<T, ColNode<Name, Col>, K>
				: T[Nx<J>] extends OpTok<"*"> // type-mutate: equivalent cond-false – declining a star shortcut uses the general target parser
					? TryTargetTail<T, StarNode<Name>, Nx<Nx<J>>>
					: null
			: T[J] extends OpTok<"("> | StrTok // type-mutate: equivalent cond-swap cond-true cond-false – TryTargetTail also declines call and literal suffixes; misses use the general target parser
				? null
				: TryTargetTail<T, ColNode<null, Name>, J>
		: null;

type TryTargetTail<T extends Toks, E, I extends number> =
	IsTargetEnd<T[I]> extends true // type-mutate: equivalent cond-false – ParseTargetAlias returns [null, I] at these same boundaries
		? Ok<TargetNode<E, null>, I>
		: ParseTargetAlias<T, I> extends [infer A, infer J extends number] // type-mutate: equivalent cond-false tuple-swap – aliases return [string or null, number]; a failed match uses the general target parser
			? IsTargetEnd<T[J]> extends true // type-mutate: equivalent cond-false – declining an alias shortcut uses the general target parser
				? Ok<TargetNode<E, A>, J>
				: null
			: null;
type IsTargetEnd<H> = H extends // type-mutate: equivalent cond-false never-true – false declines the shortcut; a never result is read with extends true
	| OpTok<"," | ")" | ";"> // type-mutate: equivalent union-drop – missing a boundary only declines the shortcut and uses the general target parser
	| WordTok<
			| "from" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "into" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "where" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "group" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "having" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "window" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "order" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "limit" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "offset" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "fetch" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "for" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "union" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "intersect" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "except" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
			| "returning" // type-mutate: equivalent union-drop – a missed boundary uses the general target parser
	  >
	| undefined
	? true // type-mutate: equivalent bool-flip – a false boundary only declines the shortcut and uses the general target parser
	: false;

type ContinueTargets<
	T extends Toks,
	E,
	I extends number,
	Acc extends readonly unknown[],
> =
	EatOp<T, I, ","> extends never
		? Ok<[...Acc, E], I>
		: ParseTargetList<T, EatOp<T, I, ",">, [...Acc, E]>;

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

/**
 * `[AS] alias` → `[alias | null, next]`, or an error for `AS` without a label. After AS any
 * keyword is accepted; a bare alias is any keyword but the `NotBareLabel` ones.
 */
type ParseTargetAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? AnyLabel<T, Nx<I>> extends [infer V, infer J]
			? [V, J]
			: SyntaxErrorAt<T, Nx<I>>
		: T[I] extends IdTok<infer V>
			? [V, Nx<I>]
			: T[I] extends WordTok<infer V>
				? V extends NotBareLabel
					? [null, I]
					: [V, Nx<I>]
				: [null, I];

// ───────────────────────────── FROM ─────────────────────────────

export type ParseFromOpt<T extends Toks, I extends number> =
	EatWord<T, I, "from"> extends never
		? Ok<[], I>
		: ParseFromList<T, EatWord<T, I, "from">, []>;

export type ParseFromList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseFromItem<T, I> extends infer X
		? X extends Ok<infer F, infer J>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, F], J>
				: ParseFromList<T, EatOp<T, J, ",">, [...Acc, F]>
			: X
		: never;

export type ParseFromItem<T extends Toks, I extends number> =
	ParseFromPrimary<T, I> extends infer X
		? X extends Ok<infer F, infer J>
			? ParseJoins<T, F, J>
			: X
		: never;

export type ParseFromPrimary<T extends Toks, I extends number> =
	T[I] extends WordTok<"lateral">
		? ParseFromPrimaryLateral<T, Nx<I>, true>
		: T[I] extends WordTok<"only">
			? ParseOnlyItem<T, Nx<I>>
			: ParseFromPrimaryLateral<T, I, false>;

/**
 * A FROM item after `[LATERAL]`. After LATERAL only a subquery, a function (`func_table`),
 * XMLTABLE or JSON_TABLE may follow: a table name and a parenthesized join are syntax errors there.
 */
type ParseFromPrimaryLateral<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	T[I] extends OpTok<"(">
		? IsSelectStart<T, Nx<I>> extends true
			? ParseSelectStmt<T, Nx<I>> extends infer X
				? X extends Ok<infer S, infer J>
					? EatOp<T, J, ")"> extends never
						? ParenJoinOr<T, I, Lateral, Expected<'")"', T, J>>
						: ParseAliasChecked<T, EatOp<T, J, ")">> extends infer AR
							? AR extends [infer A, infer CA, infer J2 extends number]
								? Ok<FromSubNode<S, A, CA, Lateral>, J2>
								: AR
							: never
					: ParenJoinOr<T, I, Lateral, X>
				: never
			: Lateral extends true
				? SyntaxErrorAt<T, Nx<I>>
				: ParseParenJoin<T, I>
		: T[I] extends WordTok<FromFuncWord>
			? FromSpecialFunc<T, I, Lateral>
			: T[I] extends WordTok<"json_table">
				? T[Nx<I>] extends OpTok<"(">
					? ParseJsonTableItem<T, Nx<Nx<I>>>
					: ParseNamedFromItem<T, I, Lateral>
				: T[I] extends WordTok<"rows">
					? T[Nx<I>] extends WordTok<"from">
						? ParseRowsFrom<T, Nx<Nx<I>>, Lateral>
						: ParseNamedFromItem<T, I, Lateral>
					: ParseNamedFromItem<T, I, Lateral>;

/** `JSON_TABLE(…) [[AS] alias [(cols)]]` after `JSON_TABLE(` (parser/json.ts); always lateral. */
type ParseJsonTableItem<T extends Toks, I extends number> =
	ParseJsonTable<T, I> extends infer X
		? X extends Ok<infer JT, infer J>
			? ParseAliasChecked<T, J> extends infer AR
				? AR extends [infer A, infer CA, infer J2 extends number]
					? Ok<FromJsonTableNode<JT, A, CA>, J2>
					: AR
				: never
			: X
		: never;

/** Table (with optional TABLESAMPLE), view or function call in FROM; after LATERAL a function only. */
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
				? ParseXmlTable<T, Nx<J>>
				: ParseFromCall<T, I, J> extends infer X
					? X extends Ok<infer Call, infer J2>
						? ParseFuncAlias<T, Call, Lateral, J2>
						: X
					: never
			: Lateral extends true
				? SyntaxErrorAt<T, J>
				: ParseTableItem<T, Parts, SkipInheritanceStar<T, J>>
		: Expected<"table name, subquery or function", T, I>;

/** `[AS] alias [(cols)] [TABLESAMPLE …]` after the table name `Parts`. */
type ParseTableItem<
	T extends Toks,
	Parts extends readonly string[],
	I extends number,
> =
	ParseAliasChecked<T, I> extends infer AR
		? AR extends [infer A, infer CA, infer J extends number]
			? T[J] extends WordTok<"tablesample">
				? ParseTableSample<T, FromTableNode<RefOf<Parts>, A, CA>, Nx<J>>
				: Ok<FromTableNode<RefOf<Parts>, A, CA>, J>
			: AR
		: never;

/** After `ONLY` in FROM: `name` or `(name)`, without `*`, then the table's alias and TABLESAMPLE. */
type ParseOnlyItem<T extends Toks, I extends number> =
	OnlyRelation<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseTableItem<T, Parts, J>
		: OnlyRelation<T, I>;
/** `name` or `(name)` after ONLY (`relation_expr`) → `[parts, next]`, or an error. */
type OnlyRelation<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? QualName<T, Nx<I>> extends [infer Parts, infer J extends number]
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: [Parts, EatOp<T, J, ")">]
			: Expected<"table name", T, Nx<I>>
		: QualName<T, I> extends [unknown, number]
			? QualName<T, I>
			: Expected<"table name", T, I>;

/**
 * Function-like syntax in FROM (`func_expr_common_subexpr`): `CURRENT_DATE`, `LOCALTIMESTAMP(3)`,
 * `CAST(… AS T)`, `COLLATION FOR (…)`. These words are never table names.
 */
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
		? T[Nx<I>] extends WordTok<"for">
			? FromFuncExpr<T, I, Lateral>
			: ParseNamedFromItem<T, I, Lateral>
		: FromFuncExpr<T, I, Lateral>;
type FromFuncExpr<T extends Toks, I extends number, Lateral extends boolean> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer Call, infer J>
			? ParseFuncAlias<T, Call, Lateral, J>
			: X
		: never;

/**
 * `((SELECT ...) s JOIN ...)`: a parenthesized item that starts like a subquery but is a
 * join (Postgres's `'(' joined_table ')'`). Tried when reading a subquery fails, but not after
 * LATERAL, which takes no join.
 */
type ParenJoinOr<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
	E,
> = Lateral extends true
	? E
	: T[Nx<I>] extends OpTok<"(">
		? ParseParenJoin<T, I>
		: E;
/** `( joined_table ) [alias]`: the parentheses must hold a join (`(t)` and `((SELECT 1) s)` are syntax errors). */
type ParseParenJoin<T extends Toks, I extends number> =
	ParseFromItem<T, Nx<I>> extends infer X
		? X extends Ok<infer F, infer J>
			? EatOp<T, J, ")"> extends never
				? Expected<'")"', T, J>
				: F extends { readonly t: "join" }
					? ParseParenJoinAlias<T, F, EatOp<T, J, ")">>
					: SyntaxErrorAt<T, J>
			: X
		: never;

/**
 * A function in FROM is `func_expr_windowless`: `f() OVER (...)`, `FILTER (...)` and
 * `WITHIN GROUP (...)` are syntax errors there (Postgres reads `over` / `filter` / `within`
 * as the alias and fails on what follows; `GROUP` then starts a GROUP BY). `J` is the index
 * of the call's `(`.
 */
type ParseFromCall<T extends Toks, I extends number, J extends number> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer Call, number>
			? Call extends
					| { readonly over: true }
					| { readonly filter: Expr }
					| { readonly withinGroup: Expr }
				? WindowlessError<T, Extract<SkipToCloseParen<T, Nx<J>>, number>> // the call parsed: its `(` is closed
				: X
			: X
		: never;
type WindowlessError<T extends Toks, K extends number> = T[Nx<K>] extends
	| OpTok<"(">
	| WordTok<"group">
	? SyntaxErrorAt<T, Nx<Nx<K>>>
	: SyntaxErrorAt<T, Nx<K>>;

/** After `TABLESAMPLE`: `method (args) [REPEATABLE (seed)]`. */
type ParseTableSample<T extends Toks, Tbl, I extends number> =
	FuncName<T, I> extends [infer M, infer J extends number]
		? EatOp<T, J, "("> extends never
			? Expected<'"("', T, J>
			: ParseExprList<T, EatOp<T, J, "(">, []> extends infer X
				? X extends Ok<infer Args, infer J2>
					? EatOp<T, J2, ")"> extends never
						? Expected<'")"', T, J2>
						: ParseRepeatable<T, EatOp<T, J2, ")">> extends infer R
							? R extends Ok<infer Rep, infer J3>
								? Ok<
										{
											t: "sample";
											table: Tbl;
											method: M extends readonly [...string[], infer L]
												? L
												: never;
											args: Args;
											repeatable: Rep;
										},
										J3
									>
								: R
							: never
					: X
				: never
		: Expected<"tablesample method", T, I>;
type ParseRepeatable<T extends Toks, I extends number> =
	EatWord<T, I, "repeatable"> extends never
		? Ok<null, I>
		: EatOp<T, EatWord<T, I, "repeatable">, "("> extends never
			? Expected<'"("', T, EatWord<T, I, "repeatable">>
			: ParseExpr<
						T,
						EatOp<T, EatWord<T, I, "repeatable">, "(">,
						0
					> extends infer X
				? X extends Ok<infer E, infer J>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: Ok<E, EatOp<T, J, ")">>
					: X
				: never;

/** After `ROWS FROM`: `(f(...) [AS (coldefs)], ...) [WITH ORDINALITY] [alias]`. */
type ParseRowsFrom<T extends Toks, I extends number, Lateral extends boolean> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: ParseRowsFromItems<T, EatOp<T, I, "(">, []> extends infer X
			? X extends Ok<infer Funcs, infer J>
				? ParseFuncAlias<T, null, Lateral, J> extends infer Y
					? Y extends Ok<
							{
								readonly alias: infer A;
								readonly colAliases: infer CA;
								readonly colDefs: infer CD;
								readonly withOrdinality: infer Ord;
							},
							infer J2
						>
						? Ok<FromRowsNode<Funcs, A, CA, CD, Lateral, Ord>, J2>
						: Y
					: never
				: X
			: never;
type ParseRowsFromItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	FuncName<T, I> extends [unknown, infer J extends number]
		? T[J] extends OpTok<"(">
			? ParseFromCall<T, I, J> extends infer X
				? X extends Ok<infer Call, infer J2>
					? ParseItemColDefs<T, J2> extends infer D
						? D extends Ok<infer Defs, infer J3>
							? EatOp<T, J3, ","> extends never
								? EatOp<T, J3, ")"> extends never
									? Expected<'"," or ")"', T, J3>
									: Ok<[...Acc, FromRowNode<Call, Defs>], EatOp<T, J3, ")">>
								: ParseRowsFromItems<
										T,
										EatOp<T, J3, ",">,
										[...Acc, FromRowNode<Call, Defs>]
									>
							: D
						: never
					: X
				: never
			: Expected<'"("', T, J>
		: Expected<"function call", T, I>;
type ParseItemColDefs<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? T[Nx<I>] extends OpTok<"(">
			? ParseColDefs<T, Nx<Nx<I>>, []>
			: Expected<'"("', T, Nx<I>>
		: Ok<null, I>;

/**
 * `(a JOIN b ...) [AS] j [(cols)]`: an alias on a parenthesized join hides the inner table
 * names, exactly like a derived table, so it is represented as `(SELECT * FROM a JOIN b ...) j`
 * (LATERAL, so LATERAL items inside still see earlier FROM items).
 */
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

/** `name *` — the inheritance marker is accepted and ignored. */
type SkipInheritanceStar<T extends Toks, I extends number> =
	T[I] extends OpTok<"*"> ? Nx<I> : I;

export type RefOf<Parts extends readonly string[]> = Parts extends readonly [
	infer N,
]
	? RefNode<null, N>
	: Parts extends readonly [infer S, infer N]
		? RefNode<S, N>
		: Parts extends readonly [string, infer S, infer N]
			? RefNode<S, N>
			: never;

/** `[WITH ORDINALITY] [AS] alias [(cols)] | [AS] [alias] (coldefs)` after a function in FROM. */
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
			? T[Nx<I1>] extends OpTok<"(">
				? Ord extends true
					? Fail<
							"WITH ORDINALITY cannot be used with a column definition list",
							Nx<I1>
						>
					: ParseColDefs<T, Nx<Nx<I1>>, []> extends infer X
						? X extends Ok<infer Defs, infer J>
							? Ok<FromFuncNode<Call, null, null, Defs, Lateral, Ord>, J>
							: X
						: never
				: ParseFuncAliasNamed<T, Call, Lateral, Ord, I1>
			: ParseFuncAliasNamed<T, Call, Lateral, Ord, I1>
		: never;
/** `alias (coldefs)` needs the alias (`f() (a int)` is a syntax error at `(`), and no column aliases before it. */
type ParseFuncAliasNamed<
	T extends Toks,
	Call,
	Lateral extends boolean,
	Ord extends boolean,
	I extends number,
> =
	ParseAliasChecked<T, I, true> extends infer AR
		? AR extends [infer A, infer CA, infer J extends number]
			? [A, CA, T[J]] extends [string, null, OpTok<"(">]
				? Ord extends true
					? Fail<
							"WITH ORDINALITY cannot be used with a column definition list",
							J
						>
					: ParseColDefs<T, Nx<J>, []> extends infer X
						? X extends Ok<infer Defs, infer J2>
							? Ok<FromFuncNode<Call, A, null, Defs, Lateral, Ord>, J2>
							: X
						: never
				: Ok<FromFuncNode<Call, A, CA, null, Lateral, Ord>, J>
			: AR
		: never;
type SkipOrdinality<T extends Toks, I extends number> =
	EatWords<T, I, ["with", "ordinality"]> extends never
		? [false, I]
		: [true, EatWords<T, I, ["with", "ordinality"]>];

/** `name type, name type, ...)` — I is just after `(`. */
type ParseColDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer N, infer J extends number]
		? ParseTypeName<T, J> extends infer X
			? X extends Ok<infer Ty, infer J2>
				? EatOp<T, J2, ","> extends never
					? EatOp<T, J2, ")"> extends never
						? Expected<'"," or ")"', T, J2>
						: Ok<[...Acc, ColDefNode<N, Ty>], EatOp<T, J2, ")">>
					: ParseColDefs<T, EatOp<T, J2, ",">, [...Acc, ColDefNode<N, Ty>]>
				: X
			: never
		: Expected<"column definition", T, I>;

/**
 * `[AS] alias [(col, ...)]` → `[alias | null, colAliases | null, next]`. Table aliases are
 * `ColId`s even after AS: `AS order`, `AS left` are syntax errors in Postgres, here too.
 * `Fn`: after a function, where `alias (` may open a column definition list instead.
 */
export type ParseAliasChecked<
	T extends Toks,
	I extends number,
	Fn extends boolean = false,
> =
	T[I] extends WordTok<"as">
		? Ident<T, Nx<I>> extends [infer A extends string, infer J extends number]
			? ParseColAliases<T, A, J, Fn>
			: SyntaxErrorAt<T, Nx<I>>
		: Ident<T, I> extends [infer A extends string, infer J extends number]
			? ParseColAliases<T, A, J, Fn>
			: [null, null, I];
/**
 * After a function, `alias (a int)` is a column definition list: as in Postgres's grammar, the
 * list is one of column aliases when its first name is followed by `,` or `)`.
 */
type ParseColAliases<
	T extends Toks,
	A extends string,
	I extends number,
	Fn extends boolean,
> =
	T[I] extends OpTok<"(">
		? Fn extends true
			? Ident<T, Nx<I>> extends [string, infer J extends number]
				? T[J] extends OpTok<"," | ")">
					? ParenAliases<T, A, I>
					: [A, null, I]
				: [A, null, I]
			: ParenAliases<T, A, I>
		: [A, null, I];
type ParenAliases<T extends Toks, A extends string, I extends number> =
	ParenIdentList<T, I> extends infer R
		? R extends Ok<infer Cols, infer J>
			? [A, Cols, J]
			: R
		: never;

export type ParseJoins<T extends Toks, L, I extends number> =
	T[I] extends WordTok<"cross">
		? T[Nx<I>] extends WordTok<"join">
			? ParseJoinRhs<T, L, "cross", false, Nx<Nx<I>>>
			: Expected<"JOIN", T, Nx<I>>
		: T[I] extends WordTok<"natural">
			? ParseJoinKind<T, Nx<I>> extends infer R
				? R extends [infer K extends JoinKind, infer J extends number]
					? ParseJoinRhs<T, L, K, true, J>
					: R extends null
						? Expected<"JOIN", T, Nx<I>>
						: R
				: never
			: ParseJoinKind<T, I> extends infer R
				? R extends [infer K extends JoinKind, infer J extends number]
					? ParseJoinRhs<T, L, K, false, J>
					: R extends null
						? Ok<L, I>
						: R
				: never;

/**
 * `[INNER | LEFT | RIGHT | FULL] [OUTER] JOIN` → `[kind, next]`; `null` when no join starts at
 * `I`; an error when a join word is not followed by JOIN (at the token where JOIN is missing).
 */
type ParseJoinKind<T extends Toks, I extends number> =
	T[I] extends WordTok<"join">
		? ["inner", Nx<I>]
		: T[I] extends WordTok<"inner">
			? JoinWord<T, "inner", Nx<I>>
			: T[I] extends WordTok<infer K extends "left" | "right" | "full">
				? JoinWord<T, K, SkipWord<T, Nx<I>, "outer">>
				: null;
type JoinWord<T extends Toks, K extends JoinKind, I extends number> =
	T[I] extends WordTok<"join"> ? [K, Nx<I>] : Expected<"JOIN", T, I>;

/**
 * Right side of a join. A qualified join (one that needs ON / USING) takes a whole joined
 * table on its right, so `a JOIN b LEFT JOIN c ON p ON q` is `a JOIN (b LEFT JOIN c ON p) ON q`
 * (Postgres's `table_ref` grammar); CROSS and NATURAL joins take a single item (left-assoc).
 */
type ParseJoinRhs<
	T extends Toks,
	L,
	K extends JoinKind,
	Natural extends boolean,
	I extends number,
> =
	ParseFromPrimary<T, I> extends infer X
		? X extends Ok<infer Rt, infer J>
			? K extends "cross"
				? UnqualifiedJoin<T, L, K, Rt, Natural, J>
				: Natural extends true
					? UnqualifiedJoin<T, L, K, Rt, Natural, J>
					: ParseJoins<T, Rt, J> extends infer Y
						? Y extends Ok<infer Rt2, infer J2>
							? ParseJoinQual<T, L, K, Rt2, J2>
							: Y
						: never
			: X
		: never;
/** A CROSS or NATURAL join: no ON / USING. */
type UnqualifiedJoin<
	T extends Toks,
	L,
	K extends JoinKind,
	Rt,
	Natural extends boolean,
	J extends number,
> = ParseJoins<T, JoinNode<K, L, Rt, null, null, Natural>, J>;
/** `ON cond | USING (cols) [AS alias]` after the right side of a qualified join. */
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
			: ParenIdentList<T, EatWord<T, J, "using">> extends infer U
				? U extends Ok<infer Cols, infer J2>
					? SkipUsingAlias<T, J2> extends infer J3
						? J3 extends number
							? ParseJoins<T, JoinNode<K, L, Rt, null, Cols, false>, J3>
							: J3
						: never
					: U
				: never
		: ParseExpr<T, EatWord<T, J, "on">, 0> extends infer On
			? On extends Ok<infer Cond, infer J2>
				? ParseJoins<T, JoinNode<K, L, Rt, Cond, null, false>, J2>
				: On
			: never;
/** `USING (...) AS join_alias` (PG 14+): the alias, a `ColId`, is accepted but not bound. */
type SkipUsingAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? Ident<T, Nx<I>> extends [string, infer J]
			? J
			: SyntaxErrorAt<T, Nx<I>>
		: I;

// ───────────────────────────── WHERE / GROUP BY / HAVING / WINDOW ─────────────────────────────

export type ParseWhereOpt<T extends Toks, I extends number> =
	EatWord<T, I, "where"> extends never
		? Ok<null, I>
		: ParseExpr<T, EatWord<T, I, "where">, 0>;

type ParseGroupByOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["group", "by"]> extends never
		? Ok<[null, false], I>
		: ParseGroupItems<
				T,
				SkipWord<T, EatWords<T, I, ["group", "by"]>, "all" | "distinct">,
				[],
				false
			>;

/**
 * `Sets`: `false` without grouping sets; the items of ROLLUP / CUBE (they may be left out of a
 * set); `true` once GROUPING SETS or `()` appears (its sets are not kept).
 */
type ParseGroupItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	T[I] extends WordTok<"rollup" | "cube">
		? T[Nx<I>] extends OpTok<"(">
			? ParseExprList<T, Nx<Nx<I>>, []> extends infer X
				? X extends Ok<infer Items extends readonly unknown[], infer J>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: GroupNext<
								T,
								EatOp<T, J, ")">,
								[...Acc, ...Items],
								Sets extends true
									? true
									: [...(Sets extends readonly unknown[] ? Sets : []), ...Items] // type-mutate: equivalent tuple-swap – the items are read as a set of names
							>
					: X
				: never
			: ParseGroupExpr<T, I, Acc, Sets> // `cube`, `rollup`: column names
		: T[I] extends WordTok<"grouping">
			? T[Nx<I>] extends WordTok<"sets">
				? T[Nx<Nx<I>>] extends OpTok<"(">
					? SkipToCloseParen<T, Nx<Nx<Nx<I>>>> extends infer J
						? J extends number
							? GroupNext<T, J, Acc, true>
							: J
						: never
					: Expected<'"("', T, Nx<Nx<I>>>
				: ParseGroupExpr<T, I, Acc, Sets>
			: T[I] extends OpTok<"(">
				? T[Nx<I>] extends OpTok<")">
					? GroupNext<T, Nx<Nx<I>>, Acc, true>
					: ParseGroupExpr<T, I, Acc, Sets>
				: ParseGroupExpr<T, I, Acc, Sets>;
type GroupSets = boolean | readonly unknown[];
type ParseGroupExpr<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? GroupNext<T, J, [...Acc, E], Sets>
			: X
		: never;
type GroupNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends GroupSets,
> =
	EatOp<T, I, ","> extends never
		? Ok<[Acc, Sets], I>
		: ParseGroupItems<T, EatOp<T, I, ",">, Acc, Sets>;

type ParseHavingOpt<T extends Toks, I extends number> =
	EatWord<T, I, "having"> extends never
		? Ok<null, I>
		: ParseExpr<T, EatWord<T, I, "having">, 0>;

/** `WINDOW name AS (spec), ...` → `Ok<NamedWindow[], next>`. */
type ParseWindowClause<T extends Toks, I extends number> =
	T[I] extends WordTok<"window"> ? ParseWindowDefs<T, Nx<I>, []> : Ok<[], I>;
type ParseWindowDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer Name, infer J extends number]
		? EatWord<T, J, "as"> extends never
			? Expected<"AS", T, J>
			: EatOp<T, EatWord<T, J, "as">, "("> extends never
				? Expected<'"("', T, EatWord<T, J, "as">>
				: ParseWindowSpec<T, EatOp<T, EatWord<T, J, "as">, "(">> extends infer X
					? X extends Ok<infer Spec, infer J2>
						? EatOp<T, J2, ","> extends never
							? Ok<[...Acc, WindowNode<Name, Spec>], J2>
							: ParseWindowDefs<
									T,
									EatOp<T, J2, ",">,
									[...Acc, WindowNode<Name, Spec>]
								>
						: X
					: never
		: Expected<"window name", T, I>;

// ───────────────────────────── WITH ─────────────────────────────

/** After `WITH`. */
export type ParseWith<T extends Toks, I extends number> =
	EatWord<T, I, "recursive"> extends never
		? ParseCtes<T, I, [], false>
		: ParseCtes<T, EatWord<T, I, "recursive">, [], true>;

type ParseCtes<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Rec extends boolean,
> =
	Ident<T, I> extends [infer Name, infer J extends number]
		? ParseCteCols<T, J> extends infer CC
			? CC extends Ok<infer Cols, infer J2>
				? EatWord<T, J2, "as"> extends never
					? Expected<"AS", T, J2>
					: EatOp<
								T,
								SkipMaterialized<T, EatWord<T, J2, "as">>,
								"("
							> extends never
						? Expected<'"("', T, SkipMaterialized<T, EatWord<T, J2, "as">>>
						: ParseStatement<
									T,
									EatOp<T, SkipMaterialized<T, EatWord<T, J2, "as">>, "(">,
									false
								> extends infer X
							? X extends Ok<infer S, infer J3>
								? EatOp<T, J3, ")"> extends never
									? Expected<'")"', T, J3>
									: ParseSearchCycle<T, EatOp<T, J3, ")">> extends infer SC
										? SC extends Ok<[infer Search, infer Cycle], infer J4>
											? CteNext<
													T,
													J4,
													[...Acc, CteNode<Name, Cols, S, Search, Cycle>],
													Rec
												>
											: SC
										: never
								: X
							: never
				: CC
			: never
		: Expected<"CTE name", T, I>;
type CteNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Rec extends boolean,
> =
	EatOp<T, I, ","> extends never
		? Ok<WithNode<Rec, Acc>, I>
		: ParseCtes<T, EatOp<T, I, ",">, Acc, Rec>;
type ParseCteCols<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? ParenIdentList<T, I> : Ok<null, I>;
type SkipMaterialized<T extends Toks, I extends number> =
	EatWords<T, I, ["not", "materialized"]> extends never
		? SkipWord<T, I, "materialized">
		: EatWords<T, I, ["not", "materialized"]>;

/** `[SEARCH ...] [CYCLE ...]` after a CTE's `)` → `Ok<[search | null, cycle | null], next>`. */
type ParseSearchCycle<T extends Toks, I extends number> =
	ParseCteSearch<T, I> extends infer S
		? S extends Ok<infer Search, infer J>
			? ParseCteCycle<T, J> extends infer C
				? C extends Ok<infer Cycle, infer J2>
					? Ok<[Search, Cycle], J2>
					: C
				: never
			: S
		: never;
/** `SEARCH {DEPTH | BREADTH} FIRST BY col, ... SET seq_col` */
type ParseCteSearch<T extends Toks, I extends number> =
	T[I] extends WordTok<"search">
		? T[Nx<I>] extends WordTok<infer D extends "depth" | "breadth">
			? EatWords<T, Nx<Nx<I>>, ["first", "by"]> extends never
				? Expected<"FIRST BY", T, Nx<Nx<I>>>
				: ParseColIdList<
							T,
							EatWords<T, Nx<Nx<I>>, ["first", "by"]>,
							[]
						> extends infer X
					? X extends Ok<infer Cols, infer J>
						? ParseSetCol<T, J> extends infer SC
							? SC extends Ok<infer Set, infer J2>
								? Ok<
										{
											breadth: D extends "breadth" ? true : false;
											cols: Cols;
											set: Set;
										},
										J2
									>
								: SC
							: never
						: X
					: never
			: Expected<"DEPTH or BREADTH", T, Nx<I>>
		: Ok<null, I>;
/** `CYCLE col, ... SET mark_col [TO value DEFAULT default] USING path_col` */
type ParseCteCycle<T extends Toks, I extends number> =
	T[I] extends WordTok<"cycle">
		? ParseColIdList<T, Nx<I>, []> extends infer X
			? X extends Ok<infer Cols, infer J>
				? ParseSetCol<T, J> extends infer SC
					? SC extends Ok<infer Mark, infer J2>
						? T[J2] extends WordTok<"to">
							? ParseCycleConst<T, Nx<J2>> extends infer V
								? V extends Ok<infer To, infer J3>
									? EatWord<T, J3, "default"> extends never
										? Expected<"DEFAULT", T, J3>
										: ParseCycleConst<
													T,
													EatWord<T, J3, "default">
												> extends infer D
											? D extends Ok<infer Def, infer J4>
												? ParseCycleUsing<T, J4, Cols, Mark, To, Def>
												: D
											: never
									: V
								: never
							: ParseCycleUsing<T, J2, Cols, Mark, null, null>
						: SC
					: never
				: X
			: never
		: Ok<null, I>;
type ParseCycleUsing<T extends Toks, I extends number, Cols, Mark, To, Def> =
	EatWord<T, I, "using"> extends never
		? Expected<"USING", T, I>
		: Ident<T, EatWord<T, I, "using">> extends [infer P, infer J extends number]
			? Ok<{ cols: Cols; set: Mark; to: To; default: Def; using: P }, J>
			: Expected<"column name", T, EatWord<T, I, "using">>;
/**
 * `TO` / `DEFAULT` values are constants (`AexprConst`): numbers, strings, booleans, NULL,
 * `type 'literal'`, never in parentheses. After a name (`x`, `x.y`, `f(1)`) Postgres expects the
 * string of a `type 'literal'`: the error is at the token after it.
 */
type ParseCycleConst<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? SyntaxErrorAt<T, I>
		: ParseExpr<T, I, 13> extends infer X
			? X extends Ok<infer E, infer J>
				? E extends { readonly t: "num" | "str" | "bool" | "null" | "typed" }
					? X
					: FuncName<T, I> extends null
						? SyntaxErrorAt<T, I>
						: SyntaxErrorAt<T, J>
				: X
			: never;
type ParseSetCol<T extends Toks, I extends number> =
	EatWord<T, I, "set"> extends never
		? Expected<"SET", T, I>
		: Ident<T, EatWord<T, I, "set">> extends [infer N, infer J extends number]
			? Ok<N, J>
			: Expected<"column name", T, EatWord<T, I, "set">>;
/** `col, col, ...` (no parentheses) */
type ParseColIdList<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, N], J>
			: ParseColIdList<T, EatOp<T, J, ",">, [...Acc, N]>
		: Expected<"column name", T, I>;

export type { Cte, Expr, FromItem, SelectBody, Target };
