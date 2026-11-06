import type {
	AliasAt,
	CloseOk,
	Expect,
	IsOp,
	IsWord,
	Name,
	NamesV,
	SpanText,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { Ok, Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type {
	Cte,
	Expr,
	FromItem,
	JsonTableCol,
	NamedWindow,
	SelectBody,
	SelectStmt,
	TableRef,
	Target,
	WindowSpec,
	WithClause,
} from "../ast.js";
import type {
	IsSubqueryParen,
	ParseExpr,
	ParseExprList,
	ParseOrderList,
	ParseWindowSpec,
} from "./expr.js";
import type { Reserved } from "./keywords.js";
import type { ParseCastType } from "./typename.js";
import type {
	BareAlias,
	Ident,
	IdentList,
	OptCols,
	TableAlias,
	TableRefAt,
} from "./util.js";

export type ParseSubquery<T extends Toks, I extends number> =
	IsWord<T, I, "with"> extends true
		? ParseWith<T, Next<I>> extends Ok<
				infer Wc extends WithClause,
				infer J extends number
			>
			? ParseSelectAfterWith<T, J, Wc>
			: ParseWith<T, Next<I>>
		: ParseSelectAfterWith<T, I, null>;

export type ParseWith<T extends Toks, I extends number> =
	IsWord<T, I, "recursive"> extends true
		? CteLoop<T, Next<I>, true, []>
		: CteLoop<T, I, false, []>;

type CteLoop<
	T extends Toks,
	I extends number,
	Rec extends boolean,
	Acc extends readonly Cte[],
> =
	Ident<T, I> extends infer N extends Name
		? OptCols<T, Next<I>> extends Ok<infer Cols, infer J extends number>
			? IsWord<T, J, "as"> extends true
				? Expect<T, Next<J>, "("> extends infer J1 extends number
					? ParenSubquery<T, J1> extends Ok<
							infer S extends SelectStmt,
							infer J2 extends number
						>
						? [
								...Acc,
								{
									name: N["v"];
									display: N["n"];
									cols: Cols extends readonly Name[] ? Cols : null;
									q: S;
								},
							] extends infer Acc2 extends readonly Cte[]
							? IsOp<T, J2, ","> extends true
								? CteLoop<T, Next<J2>, Rec, Acc2>
								: Ok<{ recursive: Rec; ctes: Acc2 }, J2>
							: never
						: ParenSubquery<T, J1>
					: Expect<T, Next<J>, "(">
				: SyntaxErr<T, J>
			: OptCols<T, Next<I>>
		: SyntaxErr<T, I>;

/** A query followed by its closing parenthesis. */
type ParenSubquery<T extends Toks, I extends number> =
	ParseSubquery<T, I> extends Ok<
		infer Q extends SelectStmt,
		infer J extends number
	>
		? CloseOk<T, J, Q>
		: ParseSubquery<T, I>;

export type ParseSelectAfterWith<T extends Toks, I extends number, W> =
	ParseCompound<T, I> extends Ok<
		infer Body extends SelectBody,
		infer J extends number
	>
		? ParseTail<T, J, W, Body>
		: ParseCompound<T, I>;

type ParseTail<T extends Toks, I extends number, W, Body> =
	OptOrderBy<T, I> extends Ok<
		infer Ord extends readonly Expr[],
		infer J extends number
	>
		? ParseLimit<T, J> extends Ok<
				[infer Lim, infer Off],
				infer J2 extends number
			>
			? SkipLocking<T, J2> extends infer J3 extends number
				? IsWord<T, J3, "into"> extends true
					? SyntaxErr<T, J3>
					: Ok<MkSelect<W, Body, Ord, Lim, Off>, J3>
				: SkipLocking<T, J2>
			: ParseLimit<T, J>
		: OptOrderBy<T, I>;
type MkSelect<W, Body, Ord, Lim, Off> = {
	t: "select";
	with: W;
	body: Body;
	orderBy: Ord;
	limit: Lim;
	offset: Off;
};

type OptOrderBy<T extends Toks, I extends number> =
	IsWord<T, I, "order"> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? ParseOrderList<T, Next<Next<I>>, []>
			: SyntaxErr<T, Next<I>>
		: Ok<[], I>;

/** `LIMIT n`, `LIMIT off, n`, `LIMIT n OFFSET off`. */
export type ParseLimit<T extends Toks, I extends number> =
	IsWord<T, I, "limit"> extends true
		? ParseExpr<T, Next<I>> extends Ok<
				infer Lim extends Expr,
				infer J extends number
			>
			? IsWord<T, J, "offset"> extends true
				? ParseExpr<T, Next<J>> extends Ok<
						infer Off extends Expr,
						infer J2 extends number
					>
					? Ok<[Lim, Off], J2>
					: ParseExpr<T, Next<J>>
				: IsOp<T, J, ","> extends true
					? ParseExpr<T, Next<J>> extends Ok<
							infer Cnt extends Expr,
							infer J2 extends number
						>
						? Ok<[Cnt, Lim], J2>
						: ParseExpr<T, Next<J>>
					: Ok<[Lim, null], J>
			: ParseExpr<T, Next<I>>
		: Ok<[null, null], I>;

/** `FOR UPDATE`, `FOR SHARE`, `LOCK IN SHARE MODE`, with `OF t`, `NOWAIT`, `SKIP LOCKED`. */
type SkipLocking<T extends Toks, I extends number> =
	IsWord<T, I, "for"> extends true
		? IsWord<T, Next<I>, "update" | "share"> extends true
			? SkipLockOptions<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "lock"> extends true
			? IsWord<T, Next<I>, "in"> extends true
				? IsWord<T, Next<Next<I>>, "share"> extends true
					? IsWord<T, Next<Next<Next<I>>>, "mode"> extends true
						? SkipLockOptions<T, Next<Next<Next<Next<I>>>>>
						: SyntaxErr<T, Next<Next<Next<I>>>>
					: SyntaxErr<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
			: I;
type SkipLockOptions<T extends Toks, I extends number> =
	IsWord<T, I, "of"> extends true
		? SkipNames<T, Next<I>>
		: IsWord<T, I, "nowait"> extends true
			? SkipLocking<T, Next<I>>
			: IsWord<T, I, "skip"> extends true
				? IsWord<T, Next<I>, "locked"> extends true
					? SkipLocking<T, Next<Next<I>>>
					: SyntaxErr<T, Next<I>>
				: IsWord<T, I, "wait"> extends true
					? T[Next<I>] extends { readonly k: "n" }
						? SkipLocking<T, Next<Next<I>>>
						: SyntaxErr<T, Next<I>>
					: SkipLocking<T, I>;
type SkipNames<T extends Toks, I extends number> =
	Ident<T, I> extends Name
		? IsOp<T, Next<I>, ","> extends true
			? SkipNames<T, Next<Next<I>>>
			: SkipLockOptions<T, Next<I>>
		: SyntaxErr<T, I>;

type ParseCompound<T extends Toks, I extends number> =
	ParseCore<T, I> extends Ok<
		infer Core extends SelectBody,
		infer J extends number
	>
		? CompoundLoop<T, J, Core>
		: ParseCore<T, I>;

/** `ALL` or `DISTINCT` after a set operator. */
type SetQuantifier<T extends Toks, I extends number> =
	IsWord<T, I, "all"> extends true
		? [true, Next<I>]
		: IsWord<T, I, "distinct"> extends true
			? [false, Next<I>]
			: [false, I];

type CompoundLoop<
	T extends Toks,
	I extends number,
	L extends SelectBody,
> = T[I] extends {
	readonly k: "w";
	readonly v: infer Op extends "union" | "intersect" | "except";
}
	? SetQuantifier<T, Next<I>> extends [
			infer All extends boolean,
			infer J extends number,
		]
		? ParseCore<T, J> extends Ok<
				infer R extends SelectBody,
				infer J2 extends number
			>
			? Op extends "intersect"
				? IntersectRight<T, J2, R> extends Ok<
						infer R2 extends SelectBody,
						infer J3 extends number
					>
					? CompoundLoop<T, J3, { t: "setop"; op: Op; all: All; l: L; r: R2 }>
					: IntersectRight<T, J2, R>
				: CompoundLoop<T, J2, { t: "setop"; op: Op; all: All; l: L; r: R }>
			: ParseCore<T, J>
		: never
	: Ok<L, I>;

/** INTERSECT binds tighter than UNION and EXCEPT. */
type IntersectRight<T extends Toks, I extends number, L extends SelectBody> =
	IsWord<T, I, "intersect"> extends true
		? SetQuantifier<T, Next<I>> extends [
				infer All extends boolean,
				infer J extends number,
			]
			? ParseCore<T, J> extends Ok<
					infer R extends SelectBody,
					infer J2 extends number
				>
				? IntersectRight<
						T,
						J2,
						{ t: "setop"; op: "intersect"; all: All; l: L; r: R }
					>
				: ParseCore<T, J>
			: never
		: Ok<L, I>;

type ParseCore<T extends Toks, I extends number> =
	IsWord<T, I, "select"> extends true
		? ParseSimple<T, Next<I>>
		: IsWord<T, I, "values"> extends true
			? ParseValuesBody<T, Next<I>>
			: IsWord<T, I, "table"> extends true
				? ParseTableStmt<T, Next<I>>
				: IsOp<T, I, "("> extends true
					? ParenSubquery<T, Next<I>> extends Ok<
							infer Q extends SelectStmt,
							infer J extends number
						>
						? Ok<Unnest<Q>, J>
						: ParenSubquery<T, Next<I>>
					: SyntaxErr<T, I>;

/** `(SELECT …)` without ORDER BY or LIMIT is just its body. */
type Unnest<Q extends SelectStmt> = Q extends {
	readonly with: null;
	readonly orderBy: readonly [];
	readonly limit: null;
}
	? Q["body"]
	: { t: "nested"; q: Q };

/** `TABLE t` is `SELECT * FROM t`. */
type ParseTableStmt<T extends Toks, I extends number> =
	ParseTableName<T, I> extends Ok<
		{ readonly ref: infer Ref },
		infer J extends number
	>
		? Ok<
				{
					t: "simple";
					distinct: false;
					targets: [{ t: "star"; schema: null; tbl: null }];
					from: { t: "table"; ref: Ref; alias: null };
					where: null;
					groupBy: null;
					rollup: false;
					having: null;
					windows: [];
					table: true;
				},
				J
			>
		: ParseTableName<T, I>;

/** MySQL's `VALUES ROW(…), …` or MariaDB's `VALUES (…), …`. */
type ParseValuesBody<T extends Toks, I extends number> =
	IsWord<T, I, "row"> extends true
		? ParseValues<T, I, [], true> extends Ok<infer Rows, infer J extends number>
			? Ok<{ t: "values"; rows: Rows; row: true; spans: [] }, J>
			: ParseValues<T, I, [], true>
		: ParseValues<T, I, [], false> extends Ok<
					infer Rows,
					infer J extends number
				>
			? Ok<{ t: "values"; rows: Rows; row: false; spans: FirstSpans<T, I> }, J>
			: ParseValues<T, I, [], false>;

/** The text of each item of the first `VALUES` row, which MariaDB names columns after. */
type FirstSpans<T extends Toks, I extends number> = SpansLoop<
	T,
	Next<I>,
	Next<I>,
	[],
	[]
>;
type SpansLoop<
	T extends Toks,
	I extends number,
	Start extends number,
	Depth extends readonly unknown[],
	Acc extends readonly string[],
> = T[I] extends { readonly k: "o"; readonly v: infer O }
	? O extends "("
		? SpansLoop<T, Next<I>, Start, [...Depth, 0], Acc>
		: O extends ")"
			? Depth extends readonly [unknown, ...infer D]
				? SpansLoop<T, Next<I>, Start, D, Acc>
				: [...Acc, SpanText<T, Start, I>]
			: O extends ","
				? Depth extends readonly []
					? SpansLoop<
							T,
							Next<I>,
							Next<I>,
							Depth,
							[...Acc, SpanText<T, Start, I>]
						>
					: SpansLoop<T, Next<I>, Start, Depth, Acc>
				: SpansLoop<T, Next<I>, Start, Depth, Acc>
	: T[I] extends { readonly k: string }
		? SpansLoop<T, Next<I>, Start, Depth, Acc>
		: Acc;

export type ParseValues<
	T extends Toks,
	I extends number,
	Acc extends readonly (readonly Expr[])[],
	Row extends boolean,
> =
	RowOpen<T, I, Row> extends infer J extends number
		? RowItems<T, J> extends Ok<
				infer Items extends readonly Expr[],
				infer J2 extends number
			>
			? Expect<T, J2, ")"> extends infer J3 extends number
				? IsOp<T, J3, ","> extends true
					? ParseValues<T, Next<J3>, [...Acc, Items], Row>
					: Acc extends readonly []
						? Ok<[Items], J3>
						: Items["length"] extends Acc[0]["length"]
							? Ok<[...Acc, Items], J3>
							: SqlError<
									"The used SELECT statements have a different number of columns",
									J3
								>
				: Expect<T, J2, ")">
			: RowItems<T, J>
		: RowOpen<T, I, Row>;
/** The opening parenthesis of a row: after `ROW` when the first row had it. */
type RowOpen<
	T extends Toks,
	I extends number,
	Row extends boolean,
> = Row extends true
	? IsWord<T, I, "row"> extends true
		? Expect<T, Next<I>, "(">
		: SyntaxErr<T, I>
	: Expect<T, I, "(">;
/** The items of a row, which may be empty (`()`). */
type RowItems<T extends Toks, I extends number> =
	IsOp<T, I, ")"> extends true ? Ok<[], I> : ParseExprList<T, I, []>;

type SelectModifier =
	| "high_priority"
	| "straight_join"
	| "sql_small_result"
	| "sql_big_result"
	| "sql_buffer_result"
	| "sql_no_cache"
	| "sql_cache"
	| "sql_calc_found_rows";

type SkipModifiers<
	T extends Toks,
	I extends number,
	D extends boolean,
> = T[I] extends { readonly k: "w"; readonly v: infer W }
	? W extends "distinct" | "distinctrow"
		? SkipModifiers<T, Next<I>, true>
		: W extends "all" | SelectModifier
			? SkipModifiers<T, Next<I>, D>
			: [D, I]
	: [D, I];

type ParseSimple<T extends Toks, I extends number> =
	SkipModifiers<T, I, false> extends [
		infer D extends boolean,
		infer J extends number,
	]
		? ParseTargets<T, J, []> extends Ok<
				infer Targets extends readonly Target[],
				infer J2 extends number
			>
			? IsWord<T, J2, "into"> extends true
				? SyntaxErr<T, J2>
				: OptFrom<T, J2> extends Ok<infer From, infer J3 extends number>
					? OptWhere<T, J3> extends Ok<infer Where, infer J4 extends number>
						? ParseGroup<T, J4> extends Ok<
								[infer Group, infer Rollup, infer Having],
								infer J5 extends number
							>
							? ParseWindows<T, J5> extends Ok<
									infer Wins,
									infer J6 extends number
								>
								? Ok<
										{
											t: "simple";
											distinct: D;
											targets: Targets;
											from: From;
											where: Where;
											groupBy: Group;
											rollup: Rollup;
											having: Having;
											windows: Wins;
										},
										J6
									>
								: ParseWindows<T, J5>
							: ParseGroup<T, J4>
						: OptWhere<T, J3>
					: OptFrom<T, J2>
			: ParseTargets<T, J, []>
		: never;

/** `FROM DUAL` is no table. */
type OptFrom<T extends Toks, I extends number> =
	IsWord<T, I, "from"> extends true
		? IsWord<T, Next<I>, "dual"> extends true
			? Ok<null, Next<Next<I>>>
			: ParseFrom<T, Next<I>>
		: Ok<null, I>;

type OptWhere<T extends Toks, I extends number> =
	IsWord<T, I, "where"> extends true ? ParseExpr<T, Next<I>> : Ok<null, I>;

type ParseGroup<T extends Toks, I extends number> =
	OptGroupBy<T, I> extends Ok<
		[infer Group, infer Rollup],
		infer J extends number
	>
		? IsWord<T, J, "having"> extends true
			? ParseExpr<T, Next<J>> extends Ok<
					infer Having extends Expr,
					infer J2 extends number
				>
				? Ok<[Group, Rollup, Having], J2>
				: ParseExpr<T, Next<J>>
			: Ok<[Group, Rollup, null], J>
		: OptGroupBy<T, I>;

/** `GROUP BY … [WITH ROLLUP]`. */
type OptGroupBy<T extends Toks, I extends number> =
	IsWord<T, I, "group"> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? ParseOrderList<T, Next<Next<I>>, []> extends Ok<
					infer Group extends readonly Expr[],
					infer J extends number
				>
				? IsWord<T, J, "with"> extends true
					? IsWord<T, Next<J>, "rollup"> extends true
						? Ok<[Group, true], Next<Next<J>>>
						: SyntaxErr<T, Next<J>>
					: Ok<[Group, false], J>
				: ParseOrderList<T, Next<Next<I>>, []>
			: SyntaxErr<T, Next<I>>
		: Ok<[null, false], I>;

type ParseWindows<T extends Toks, I extends number> =
	IsWord<T, I, "window"> extends true
		? Ident<T, Next<I>> extends Name
			? IsWord<T, Next<Next<I>>, "as"> extends true
				? WindowLoop<T, Next<I>, []>
				: Ok<[], I>
			: Ok<[], I>
		: Ok<[], I>;
type WindowLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly NamedWindow[],
> =
	Ident<T, I> extends infer N extends Name
		? IsWord<T, Next<I>, "as"> extends true
			? Expect<T, Next<Next<I>>, "("> extends infer J extends number
				? ParseWindowSpec<T, J> extends Ok<
						infer Spec extends WindowSpec,
						infer J2 extends number
					>
					? IsOp<T, J2, ","> extends true
						? WindowLoop<T, Next<J2>, [...Acc, { name: N["v"]; spec: Spec }]>
						: Ok<[...Acc, { name: N["v"]; spec: Spec }], J2>
					: ParseWindowSpec<T, J>
				: Expect<T, Next<Next<I>>, "(">
			: SyntaxErr<T, Next<I>>
		: SyntaxErr<T, I>;

export type ParseTargets<
	T extends Toks,
	I extends number,
	Acc extends readonly Target[],
> =
	ParseTarget<T, I> extends Ok<infer Tg extends Target, infer J extends number>
		? IsOp<T, J, ","> extends true
			? ParseTargets<T, Next<J>, [...Acc, Tg]>
			: Ok<[...Acc, Tg], J>
		: ParseTarget<T, I>;

type ParseTarget<T extends Toks, I extends number> =
	IsOp<T, I, "*"> extends true
		? Ok<{ t: "star"; schema: null; tbl: null }, Next<I>>
		: IsOp<T, Next<I>, "."> extends true
			? IsOp<T, Next<Next<I>>, "*"> extends true
				? Ident<T, I> extends infer N extends Name
					? Ok<{ t: "star"; schema: null; tbl: N["v"] }, Next<Next<Next<I>>>>
					: SyntaxErr<T, I>
				: IsOp<T, Next<Next<Next<I>>>, "."> extends true
					? IsOp<T, Next<Next<Next<Next<I>>>>, "*"> extends true
						? Ident<T, I> extends infer S extends Name
							? Ident<T, Next<Next<I>>> extends infer N extends Name
								? Ok<
										{ t: "star"; schema: S["v"]; tbl: N["v"] },
										Next<Next<Next<Next<Next<I>>>>>
									>
								: SyntaxErr<T, Next<Next<I>>>
							: SyntaxErr<T, I>
						: ParseExprTarget<T, I>
					: ParseExprTarget<T, I>
			: ParseExprTarget<T, I>;

type ParseExprTarget<T extends Toks, I extends number> =
	ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? IsWord<T, J, "as"> extends true
			? AliasAt<T, Next<J>, Reserved> extends infer A extends Name
				? Ok<
						{ t: "expr"; e: E; alias: A["n"]; span: ""; tail: "" },
						Next<Next<J>>
					>
				: SyntaxErr<T, Next<J>>
			: BareAlias<T, J> extends infer A extends Name
				? Ok<{ t: "expr"; e: E; alias: A["n"]; span: ""; tail: "" }, Next<J>>
				: Ok<
						{
							t: "expr";
							e: E;
							alias: null;
							span: E extends { readonly t: "col" } ? "" : SpanText<T, I, J>;
							tail: E extends { readonly t: "col" } ? "" : TailAfter<T, I, J>;
						},
						J
					>
		: ParseExpr<T, I>;

/**
 * The whitespace after an expression ending in an unqualified word (`a + b`,
 * `x IS NULL`, but not `t.b`), which MySQL keeps in the column name.
 */
type TailAfter<T extends Toks, I extends number, J extends number> =
	LastTwo<T, I, J, null> extends [infer P, infer L]
		? L extends { readonly k: "w" }
			? P extends { readonly k: "o"; readonly v: "." }
				? ""
				: T[J] extends { readonly g: infer G extends string }
					? LeadingWs<G, "">
					: ""
			: ""
		: "";
type LastTwo<T extends Toks, I extends number, J extends number, P> =
	Next<I> extends J ? [P, T[I]] : LastTwo<T, Next<I>, J, T[I]>;
type LeadingWs<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends " " | "\n" | "\t" | "\r"}${infer R}`
	? LeadingWs<R, `${Acc}${C}`>
	: Acc;

export type ParseFrom<T extends Toks, I extends number> =
	ParseTableOrSub<T, I> extends Ok<
		infer F extends FromItem,
		infer J extends number
	>
		? JoinLoop<T, J, F>
		: ParseTableOrSub<T, I>;

/** The join's kind, whether it is NATURAL, the index after it and whether a keyword introduced it. */
type JoinOp<T extends Toks, I extends number> =
	IsOp<T, I, ","> extends true
		? ["cross", false, Next<I>, false]
		: (
					IsWord<T, I, "natural"> extends true
						? [true, Next<I>]
						: [false, I]
				) extends [infer Nat extends boolean, infer J extends number]
			? IsWord<T, J, "join" | "straight_join"> extends true
				? ["inner", Nat, Next<J>, true]
				: T[J] extends {
							readonly k: "w";
							readonly v: infer K extends "left" | "right";
						}
					? (
							IsWord<T, Next<J>, "outer"> extends true
								? Next<Next<J>>
								: Next<J>
						) extends infer J2 extends number
						? IsWord<T, J2, "join"> extends true
							? [K, Nat, Next<J2>, true]
							: SyntaxErr<T, J2>
						: never
					: T[J] extends {
								readonly k: "w";
								readonly v: infer K extends "inner" | "cross";
							}
						? IsWord<T, Next<J>, "join"> extends true
							? [K, Nat, Next<Next<J>>, true]
							: SyntaxErr<T, Next<J>>
						: Nat extends true
							? SyntaxErr<T, J>
							: null
			: never;

type JoinLoop<T extends Toks, I extends number, L> =
	JoinOp<T, I> extends infer Op
		? Op extends [
				infer Kind,
				infer Nat extends boolean,
				infer J extends number,
				infer Keyword extends boolean,
			]
			? ParseTableOrSub<T, J> extends Ok<
					infer Rt extends FromItem,
					infer J2 extends number
				>
				? JoinConstraint<T, J2, Keyword> extends Ok<
						[infer On, infer Using],
						infer J3 extends number
					>
					? JoinLoop<
							T,
							J3,
							{
								t: "join";
								kind: JoinKindOf<Kind, Nat, On, Using>;
								l: L;
								r: Rt;
								on: On;
								using: Using;
								natural: Nat;
							}
						>
					: JoinConstraint<T, J2, Keyword>
				: ParseTableOrSub<T, J>
			: Op extends null
				? Ok<L, I>
				: Op
		: never;

/** In MySQL, `JOIN` and `INNER JOIN` without a condition are cross joins. */
type JoinKindOf<Kind, Nat, On, Using> = Kind extends "inner"
	? On extends null
		? Using extends null
			? Nat extends true
				? "inner"
				: "cross"
			: "inner"
		: "inner"
	: Kind;

/** A comma join takes no ON or USING. */
type JoinConstraint<
	T extends Toks,
	I extends number,
	Keyword extends boolean,
> = Keyword extends true ? ParseJoinConstraint<T, I> : Ok<[null, null], I>;

type ParseJoinConstraint<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? ParseExpr<T, Next<I>> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? Ok<[E, null], J>
			: ParseExpr<T, Next<I>>
		: IsWord<T, I, "using"> extends true
			? IdentList<T, Next<I>> extends Ok<
					infer Cols extends readonly Name[],
					infer J extends number
				>
				? Ok<[null, NamesV<Cols>], J>
				: IdentList<T, Next<I>>
			: Ok<[null, null], I>;

type ParseTableOrSub<T extends Toks, I extends number> =
	IsWord<T, I, "lateral"> extends true
		? IsOp<T, Next<I>, "("> extends true
			? ParseDerived<T, Next<Next<I>>, true>
			: SyntaxErr<T, Next<I>>
		: IsOp<T, I, "("> extends true
			? IsSubqueryParen<T, Next<I>> extends true
				? ParseDerived<T, Next<I>, false>
				: ParseFrom<T, Next<I>> extends Ok<
							infer F extends FromItem,
							infer J extends number
						>
					? CloseOk<T, J, F>
					: ParseFrom<T, Next<I>>
			: IsWord<T, I, "json_table"> extends true
				? IsOp<T, Next<I>, "("> extends true
					? ParseJsonTable<T, Next<Next<I>>>
					: ParseTableName<T, I>
				: ParseTableName<T, I>;

/** `(SELECT …) [AS] alias [(cols)]`. */
type ParseDerived<T extends Toks, I extends number, Lateral extends boolean> =
	ParenSubquery<T, I> extends Ok<
		infer Q extends SelectStmt,
		infer J extends number
	>
		? AliasOf<T, J> extends [infer A, infer J2 extends number]
			? DerivedCols<T, J2, A> extends Ok<infer Cols, infer J3 extends number>
				? Ok<{ t: "sub"; q: Q; alias: A; cols: Cols; lateral: Lateral }, J3>
				: DerivedCols<T, J2, A>
			: AliasOf<T, J>
		: ParenSubquery<T, I>;
/** The column list of a derived table, only after an alias. */
type DerivedCols<T extends Toks, I extends number, A> = A extends string
	? OptCols<T, I>
	: Ok<null, I>;

/** `JSON_TABLE(doc, path COLUMNS (…)) [AS] alias`. */
type ParseJsonTable<T extends Toks, I extends number> =
	ParseExpr<T, I> extends Ok<infer Doc extends Expr, infer J extends number>
		? Expect<T, J, ","> extends infer J2 extends number
			? T[J2] extends { readonly k: "s" }
				? JsonColumns<T, Next<J2>> extends Ok<
						infer Cols extends readonly JsonTableCol[],
						infer J3 extends number
					>
					? Expect<T, J3, ")"> extends infer J4 extends number
						? AliasOf<T, J4> extends [infer A, infer J5 extends number]
							? Ok<{ t: "jsontable"; doc: Doc; cols: Cols; alias: A }, J5>
							: AliasOf<T, J4>
						: Expect<T, J3, ")">
					: JsonColumns<T, Next<J2>>
				: SyntaxErr<T, J2>
			: Expect<T, J, ",">
		: ParseExpr<T, I>;
type JsonColumns<T extends Toks, I extends number> =
	IsWord<T, I, "columns"> extends true
		? Expect<T, Next<I>, "("> extends infer J extends number
			? JsonColLoop<T, J, []>
			: Expect<T, Next<I>, "(">
		: SyntaxErr<T, I>;
type JsonColLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly JsonTableCol[],
> =
	JsonCol<T, I> extends Ok<infer C extends JsonTableCol, infer J extends number>
		? IsOp<T, J, ","> extends true
			? JsonColLoop<T, Next<J>, [...Acc, C]>
			: CloseOk<T, J, [...Acc, C]>
		: JsonCol<T, I>;
/** `name FOR ORDINALITY`, `name type [EXISTS] PATH 'p' [on empty/error]` or `NESTED [PATH] 'p' COLUMNS (…)`. */
type JsonCol<T extends Toks, I extends number> =
	IsWord<T, I, "nested"> extends true
		? (
				IsWord<T, Next<I>, "path"> extends true
					? Next<Next<I>>
					: Next<I>
			) extends infer J extends number
			? T[J] extends { readonly k: "s" }
				? JsonColumns<T, Next<J>> extends Ok<
						infer Cols,
						infer J2 extends number
					>
					? Ok<{ t: "nested"; cols: Cols }, J2>
					: JsonColumns<T, Next<J>>
				: SyntaxErr<T, J>
			: never
		: Ident<T, I> extends infer N extends Name
			? IsWord<T, Next<I>, "for"> extends true
				? IsWord<T, Next<Next<I>>, "ordinality"> extends true
					? Ok<{ t: "ordinality"; name: N["n"] }, Next<Next<Next<I>>>>
					: SyntaxErr<T, Next<Next<I>>>
				: ParseCastType<T, Next<I>> extends Ok<
							infer Ty extends string,
							infer J extends number
						>
					? JsonPathCol<T, SkipCollate<T, J>, N["n"], Ty>
					: ParseCastType<T, Next<I>>
			: SyntaxErr<T, I>;
type SkipCollate<T extends Toks, I extends number> =
	IsWord<T, I, "collate"> extends true ? Next<Next<I>> : I;
type JsonPathCol<
	T extends Toks,
	I extends number,
	N extends string,
	Ty extends string,
> = (
	IsWord<T, I, "exists"> extends true
		? [true, Next<I>]
		: [false, I]
) extends [infer Ex extends boolean, infer J extends number]
	? IsWord<T, J, "path"> extends true
		? T[Next<J>] extends { readonly k: "s" }
			? SkipJsonOn<T, Next<Next<J>>> extends infer J2 extends number
				? Ok<{ t: "path"; name: N; type: Ty; exists: Ex }, J2>
				: SkipJsonOn<T, Next<Next<J>>>
			: SyntaxErr<T, Next<J>>
		: SyntaxErr<T, J>
	: never;
/** `{NULL | ERROR | DEFAULT 'x'} ON {EMPTY | ERROR}`, up to twice. */
type SkipJsonOn<T extends Toks, I extends number> =
	IsWord<T, I, "null" | "error"> extends true
		? IsWord<T, Next<I>, "on"> extends true
			? SkipJsonOn<T, Next<Next<Next<I>>>>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "default"> extends true
			? IsWord<T, Next<Next<I>>, "on"> extends true
				? SkipJsonOn<T, Next<Next<Next<Next<I>>>>>
				: SyntaxErr<T, Next<Next<I>>>
			: I;

type ParseTableName<T extends Toks, I extends number> =
	TableRefAt<T, I> extends Ok<infer R extends TableRef, infer J extends number>
		? TableTail<T, J, R>
		: TableRefAt<T, I>;

/** `PARTITION (…)`, the alias and index hints after a table name. */
type TableTail<T extends Toks, I extends number, R extends TableRef> =
	SkipPartition<T, I> extends infer I0 extends number
		? WithAlias<T, I0, { t: "table"; ref: R }> extends Ok<
				infer F,
				infer J extends number
			>
			? SkipIndexHints<T, J> extends infer J2 extends number
				? Ok<F, J2>
				: SkipIndexHints<T, J>
			: WithAlias<T, I0, { t: "table"; ref: R }>
		: SkipPartition<T, I>;

type SkipPartition<T extends Toks, I extends number> =
	IsWord<T, I, "partition"> extends true
		? IdentList<T, Next<I>> extends Ok<unknown, infer J extends number>
			? J
			: IdentList<T, Next<I>>
		: I;

/** `USE INDEX (…)`, `FORCE KEY FOR JOIN (…)`, `IGNORE INDEX FOR ORDER BY (…)`, … */
type SkipIndexHints<T extends Toks, I extends number> =
	IsWord<T, I, "use" | "force" | "ignore"> extends true
		? IsWord<T, Next<I>, "index" | "key"> extends true
			? IndexHintFor<T, Next<Next<I>>> extends infer J extends number
				? IsOp<T, J, "("> extends true
					? SkipNameList<T, Next<J>> extends infer J2 extends number
						? SkipIndexHints<T, J2>
						: SkipNameList<T, Next<J>>
					: SyntaxErr<T, J>
				: IndexHintFor<T, Next<Next<I>>>
			: I
		: I;
/** `FOR JOIN`, `FOR ORDER BY`, `FOR GROUP BY` of an index hint. */
type IndexHintFor<T extends Toks, I extends number> =
	IsWord<T, I, "for"> extends true
		? IsWord<T, Next<I>, "join"> extends true
			? Next<Next<I>>
			: IsWord<T, Next<I>, "order" | "group"> extends true
				? IsWord<T, Next<Next<I>>, "by"> extends true
					? Next<Next<Next<I>>>
					: SyntaxErr<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
		: I;

/** `(a, PRIMARY, b)`: index names, which may be reserved words. */
type SkipNameList<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: ")";
}
	? Next<I>
	: T[I] extends { readonly k: "w" | "id" }
		? IsOp<T, Next<I>, ","> extends true
			? SkipNameList<T, Next<Next<I>>>
			: Expect<T, Next<I>, ")">
		: SyntaxErr<T, I>;

type AliasOf<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? AliasAt<T, Next<I>, Reserved> extends infer A extends Name
			? [A["v"], Next<Next<I>>]
			: SyntaxErr<T, Next<I>>
		: TableAlias<T, I> extends infer A extends Name
			? IsWindowClause<T, I> extends true
				? [null, I]
				: [A["v"], Next<I>]
			: [null, I];

type WithAlias<T extends Toks, I extends number, F> =
	AliasOf<T, I> extends [infer A, infer J extends number]
		? Ok<Aliased<F, A>, J>
		: AliasOf<T, I>;
type Aliased<F, A> = F extends { readonly t: "table"; readonly ref: infer R }
	? { t: "table"; ref: R; alias: A }
	: F;

type IsWindowClause<T extends Toks, I extends number> =
	IsWord<T, I, "window"> extends true
		? Ident<T, Next<I>> extends Name
			? IsWord<T, Next<Next<I>>, "as">
			: false
		: false;
