import type {
	Cte,
	Expr,
	FromItem,
	JoinKind,
	SelectBody,
	Target,
} from "../ast.js";
import type { IdTok, OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type {
	ParseExpr,
	ParseExprList,
	ParseOrderList,
	ParseWindowSpec,
} from "./expr.js";
import type { ParseJsonTable } from "./json.js";
import type { IsBareLabel } from "./keywords.js";
import type { ParseStatement } from "./stmt.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	ColIdIdent,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
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
 * unconstrained `infer` (`Ok<infer Body, infer J extends number>`): constraining the
 * inferred node against a recursive AST type walks the whole subtree (ENGINE.md
 * pitfall 12). Nodes are discriminated on `t` only.
 */

/** True if token `I` starts a SELECT-like statement (possibly parenthesized). */
export type IsSelectStart<T extends Toks, I extends number> =
	T[I] extends WordTok<"select" | "with" | "values" | "table">
		? true
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
		? B extends Ok<infer Body, infer J extends number>
			? ParseSelectTail<T, Body, W, J>
			: B
		: never;

/**
 * `[ORDER BY ...] [locking] [LIMIT/OFFSET/FETCH ...] [locking]`. Postgres accepts the
 * locking clause before or after LIMIT; it is rejected on set operations.
 */
type ParseSelectTail<T extends Toks, Body, W, I extends number> =
	ParseOrderByOpt<T, I> extends infer O
		? O extends Ok<infer Order, infer J>
			? ParseLimitOffset<T, SkipLocking<T, J>, null, null> extends infer L
				? L extends Ok<[infer Lim, infer Off], infer J2 extends number>
					? Body extends { readonly t: "setop" }
						? SkipLocking<T, J> extends J
							? SkipLocking<T, J2> extends J2
								? Ok<
										{
											t: "select";
											with: W;
											body: Body;
											orderBy: Order;
											limit: Lim;
											offset: Off;
										},
										J2
									>
								: Fail<
										"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT",
										J2
									>
							: Fail<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", J>
						: Ok<
								{
									t: "select";
									with: W;
									body: Body;
									orderBy: Order;
									limit: Lim;
									offset: Off;
								},
								SkipLocking<T, J2>
							>
					: L
				: never
			: O
		: never;

export type ParseOrderByOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? Ok<[], I>
		: ParseOrderList<T, EatWords<T, I, ["order", "by"]>>;

/** LIMIT / OFFSET / FETCH in any order. */
type ParseLimitOffset<T extends Toks, I extends number, Lim, Off> =
	EatWord<T, I, "limit"> extends never
		? EatWord<T, I, "offset"> extends never
			? EatWord<T, I, "fetch"> extends never
				? Ok<[Lim, Off], I>
				: ParseFetch<T, EatWord<T, I, "fetch">, Off> extends infer F
					? F extends Ok<readonly [infer E, unknown], infer J extends number>
						? ParseLimitOffset<T, J, E, Off>
						: F
					: never
			: ParseExpr<T, EatWord<T, I, "offset">, 0> extends infer X
				? X extends Ok<infer E, infer J>
					? ParseLimitOffset<T, SkipWord<T, J, "row" | "rows">, Lim, E>
					: X
				: never
		: EatWord<T, EatWord<T, I, "limit">, "all"> extends never
			? ParseExpr<T, EatWord<T, I, "limit">, 0> extends infer X
				? X extends Ok<infer E, infer J extends number>
					? ParseLimitOffset<T, J, E, Off>
					: X
				: never
			: ParseLimitOffset<
					T,
					EatWord<T, EatWord<T, I, "limit">, "all">,
					Lim,
					Off
				>;
/** `FETCH {FIRST|NEXT} [n] {ROW|ROWS} {ONLY|WITH TIES}` */
type ParseFetch<T extends Toks, I extends number, Off> =
	EatWord<T, I, "first" | "next"> extends never
		? Expected<"FIRST or NEXT", T, I>
		: EatWord<T, EatWord<T, I, "first" | "next">, "row" | "rows"> extends never
			? ParseExpr<T, EatWord<T, I, "first" | "next">, 0> extends infer X
				? X extends Ok<infer E, infer J>
					? Ok<[E, Off], SkipFetchTail<T, SkipWord<T, J, "row" | "rows">>>
					: X
				: never
			: Ok<
					[{ t: "num"; v: "1" }, Off],
					SkipFetchTail<
						T,
						EatWord<T, EatWord<T, I, "first" | "next">, "row" | "rows">
					>
				>;
type SkipFetchTail<T extends Toks, I extends number> =
	EatWord<T, I, "only"> extends never
		? SkipWords<T, I, ["with", "ties"]>
		: EatWord<T, I, "only">;

/** `FOR UPDATE | NO KEY UPDATE | SHARE | KEY SHARE [OF t, ...] [NOWAIT | SKIP LOCKED]` — repeated. */
type SkipLocking<T extends Toks, I extends number> =
	EatWord<T, I, "for"> extends never
		? I
		: SkipLocking<
				T,
				SkipLockWait<
					T,
					SkipLockOf<T, SkipLockStrength<T, EatWord<T, I, "for">>>
				>
			>;
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
		: I;
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
		? X extends Ok<infer L, infer J extends number>
			? ParseUnionLoop<T, L, J>
			: X
		: never;

type ParseUnionLoop<T extends Toks, L, I extends number> =
	T[I] extends WordTok<infer Op extends "union" | "except">
		? ParseIntersectChain<
				T,
				SkipWord<T, Nx<I>, "all" | "distinct">
			> extends infer X
			? X extends Ok<infer R, infer J extends number>
				? ParseUnionLoop<
						T,
						{
							t: "setop";
							op: Op;
							all: EatWord<T, Nx<I>, "all"> extends never ? false : true;
							l: L;
							r: R;
						},
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
			? X extends Ok<infer R, infer J extends number>
				? ParseIntersectLoop<
						T,
						{
							t: "setop";
							op: "intersect";
							all: EatWord<T, Nx<I>, "all"> extends never ? false : true;
							l: L;
							r: R;
						},
						J
					>
				: X
			: never
		: Ok<L, I>;

type ParseSetOperand<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParseSelectStmt<T, Nx<I>> extends infer X
			? X extends Ok<infer S, infer J extends number>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: Ok<{ t: "paren"; q: S }, EatOp<T, J, ")">>
				: X
			: never
		: T[I] extends WordTok<"select">
			? ParseSimpleSelect<T, Nx<I>>
			: T[I] extends WordTok<"values">
				? ParseValues<T, Nx<I>>
				: T[I] extends WordTok<"table">
					? ParseTableShorthand<T, SkipWord<T, Nx<I>, "only">>
					: Expected<"SELECT, VALUES, TABLE or (", T, I>;

/** `TABLE [ONLY] name` ≡ `SELECT * FROM name`. */
type ParseTableShorthand<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? Ok<
				{
					t: "simple";
					distinct: false; // type-mutate: equivalent bool-flip – TABLE is SELECT *: DISTINCT changes no type, and its ORDER BY rule is not checked after a star
					targets: [{ e: { t: "star"; tbl: null }; alias: null }];
					from: [
						{ t: "table"; ref: RefOf<Parts>; alias: null; colAliases: null },
					];
					where: null;
					groupBy: null;
					groupingSets: false;
					having: null;
					windows: [];
				},
				SkipInheritanceStar<T, J>
			>
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
			? X extends Ok<infer Row, infer J extends number>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: EatOp<T, EatOp<T, J, ")">, ","> extends never
						? Ok<{ t: "values"; rows: [...Acc, Row] }, EatOp<T, J, ")">>
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
						? EmptyTargetList<T, I1> extends true
							? Ok<[], I1>
							: ParseTargetList<T, I1, []>
						: ParseTargetList<T, I1, []>
				) extends infer TL
				? TL extends Ok<infer Targets, infer I2>
					? FromAfterInto<T, I2> extends infer F
						? F extends Ok<infer From, infer I3 extends number>
							? ParseWhereOpt<T, I3> extends infer Wh
								? Wh extends Ok<infer Where, infer I4 extends number>
									? ParseGroupByOpt<T, I4> extends infer G
										? G extends Ok<[infer Group, infer Sets], infer I5>
											? ParseHavingOpt<T, I5> extends infer Hv
												? Hv extends Ok<infer Having, infer I6>
													? ParseWindowClause<T, I6> extends infer Wn
														? Wn extends Ok<infer Windows, infer I7>
															? T[I2] extends WordTok<"into">
																? Ok<
																		{
																			t: "simple";
																			distinct: Distinct;
																			targets: Targets;
																			from: From;
																			where: Where;
																			groupBy: Group;
																			groupingSets: Sets;
																			having: Having;
																			windows: Windows;
																			into: IntoRef<T, I2>;
																		},
																		I7
																	>
																: Ok<
																		{
																			t: "simple";
																			distinct: Distinct;
																			targets: Targets;
																			from: From;
																			where: Where;
																			groupBy: Group;
																			groupingSets: Sets;
																			having: Having;
																			windows: Windows;
																		},
																		I7
																	>
															: Wn
														: never
													: Hv
												: never
											: G
										: never
									: Wh
								: never
							: F
						: never
					: TL
				: never
			: D
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
type SkipIntoPersistence<T extends Toks, I extends number> =
	T[I] extends WordTok<"local" | "global">
		? T[Nx<I>] extends WordTok<"temporary" | "temp">
			? Nx<Nx<I>>
			: I
		: SkipWord<T, I, "temporary" | "temp" | "unlogged">;

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

/** `SELECT FROM t`, `EXISTS (SELECT FROM ...)`: Postgres accepts an empty target list (a zero-column row), but not after DISTINCT. */
type EmptyTargetList<T extends Toks, I extends number> =
	T[I] extends WordTok<
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
		? true
		: T[I] extends OpTok<")" | ";">
			? true
			: T[I] extends undefined
				? true
				: false;

/** Target list: `expr [AS alias | bare_alias] , ...` */
export type ParseTargetList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J extends number>
			? ParseTargetAlias<T, J> extends [infer A, infer J2 extends number]
				? EatOp<T, J2, ","> extends never
					? Ok<[...Acc, { e: E; alias: A }], J2>
					: ParseTargetList<T, EatOp<T, J2, ",">, [...Acc, { e: E; alias: A }]>
				: ParseTargetAlias<T, J>
			: X
		: never;

/**
 * `[AS] alias` → `[alias | null, next]`, or an error for `AS` without a label. After AS any
 * keyword is accepted; bare aliases exclude `NotBareLabel` words.
 */
type ParseTargetAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? AnyLabel<T, Nx<I>> extends [
				infer V extends string,
				infer J extends number,
			]
			? [V, J]
			: SyntaxErrorAt<T, Nx<I>>
		: T[I] extends IdTok<infer V>
			? [V, Nx<I>]
			: T[I] extends WordTok<infer V>
				? IsBareLabel<V> extends true
					? [V, Nx<I>]
					: [null, I]
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
		? X extends Ok<infer F, infer J extends number>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, F], J>
				: ParseFromList<T, EatOp<T, J, ",">, [...Acc, F]>
			: X
		: never;

export type ParseFromItem<T extends Toks, I extends number> =
	ParseFromPrimary<T, I> extends infer X
		? X extends Ok<infer F, infer J extends number>
			? ParseJoins<T, F, J>
			: X
		: never;

export type ParseFromPrimary<T extends Toks, I extends number> =
	T[I] extends WordTok<FromFuncWord>
		? FromSpecialFunc<T, I>
		: T[I] extends WordTok<"lateral">
			? ParseFromPrimaryLateral<T, Nx<I>, true>
			: T[I] extends WordTok<"only">
				? ParseFromPrimaryLateral<T, Nx<I>, false>
				: ParseFromPrimaryLateral<T, I, false>;

type ParseFromPrimaryLateral<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	T[I] extends OpTok<"(">
		? IsSelectStart<T, Nx<I>> extends true
			? ParseSelectStmt<T, Nx<I>> extends infer X
				? X extends Ok<infer S, infer J extends number>
					? EatOp<T, J, ")"> extends never
						? ParenJoinOr<T, I, Expected<'")"', T, J>>
						: ParseAliasChecked<T, EatOp<T, J, ")">> extends infer AR
							? AR extends [infer A, infer CA, infer J2 extends number]
								? Ok<
										{
											t: "sub";
											q: S;
											alias: A;
											colAliases: CA;
											lateral: Lateral;
										},
										J2
									>
								: AR
							: never
					: ParenJoinOr<T, I, X>
				: never
			: ParseParenJoin<T, I>
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
		? X extends Ok<infer JT, infer J extends number>
			? ParseAliasChecked<T, J> extends infer AR
				? AR extends [infer A, infer CA, infer J2 extends number]
					? Ok<{ t: "jsontable"; jt: JT; alias: A; colAliases: CA }, J2>
					: AR
				: never
			: X
		: never;

/** Table (with optional TABLESAMPLE), view or function call in FROM. */
type ParseNamedFromItem<
	T extends Toks,
	I extends number,
	Lateral extends boolean,
> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? T[I] extends WordTok<"xmltable">
				? ParseXmlTable<T, Nx<J>>
				: ParseFromCall<T, I, J> extends infer X
					? X extends Ok<infer Call, infer J2 extends number>
						? ParseFuncAlias<T, Call, Lateral, J2>
						: X
					: never
			: ParseAliasChecked<T, SkipInheritanceStar<T, J>> extends infer AR
				? AR extends [infer A, infer CA, infer J2 extends number]
					? T[J2] extends WordTok<"tablesample">
						? ParseTableSample<
								T,
								{ t: "table"; ref: RefOf<Parts>; alias: A; colAliases: CA },
								Nx<J2>
							>
						: Ok<
								{ t: "table"; ref: RefOf<Parts>; alias: A; colAliases: CA },
								J2
							>
					: AR
				: never
		: Expected<"table name, subquery or function", T, I>;

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
type FromSpecialFunc<T extends Toks, I extends number> =
	T[I] extends WordTok<"collation">
		? T[Nx<I>] extends WordTok<"for">
			? FromFuncExpr<T, I>
			: ParseFromPrimaryLateral<T, I, false>
		: FromFuncExpr<T, I>;
type FromFuncExpr<T extends Toks, I extends number> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer Call, infer J extends number>
			? ParseFuncAlias<T, Call, false, J>
			: X
		: never;

/**
 * `((SELECT ...) s JOIN ...)`: a parenthesized item that starts like a subquery but is a
 * join (Postgres's `'(' joined_table ')'`). Tried when reading a subquery fails.
 */
type ParenJoinOr<T extends Toks, I extends number, E> =
	T[Nx<I>] extends OpTok<"("> ? ParseParenJoin<T, I> : E;
/** `( joined_table ) [alias]`: the parentheses must hold a join (`(t)` and `((SELECT 1) s)` are syntax errors). */
type ParseParenJoin<T extends Toks, I extends number> =
	ParseFromItem<T, Nx<I>> extends infer X
		? X extends Ok<infer F, infer J extends number>
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
				? WindowlessError<T, SkipToCloseParen<T, Nx<J>>>
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
	QualName<T, I> extends [
		infer M extends readonly string[],
		infer J extends number,
	]
		? EatOp<T, J, "("> extends never
			? Expected<'"("', T, J>
			: ParseExprList<T, EatOp<T, J, "(">, []> extends infer X
				? X extends Ok<infer Args, infer J2 extends number>
					? EatOp<T, J2, ")"> extends never
						? Expected<'")"', T, J2>
						: ParseRepeatable<T, EatOp<T, J2, ")">> extends infer R
							? R extends Ok<infer Rep, infer J3 extends number>
								? Ok<
										{
											t: "sample";
											table: Tbl;
											method: M extends readonly [
												...string[],
												infer L extends string,
											]
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
				? X extends Ok<infer E, infer J extends number>
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
			? X extends Ok<infer Funcs, infer J extends number>
				? ParseFuncAlias<T, null, Lateral, J> extends infer Y
					? Y extends Ok<
							{
								readonly alias: infer A;
								readonly colAliases: infer CA;
								readonly colDefs: infer CD;
								readonly withOrdinality: infer Ord;
							},
							infer J2 extends number
						>
						? Ok<
								{
									t: "rowsfrom";
									funcs: Funcs;
									alias: A;
									colAliases: CA;
									colDefs: CD;
									lateral: Lateral;
									withOrdinality: Ord;
								},
								J2
							>
						: Y
					: never
				: X
			: never;
type ParseRowsFromItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	QualName<T, I> extends [unknown, infer J extends number]
		? T[J] extends OpTok<"(">
			? ParseFromCall<T, I, J> extends infer X
				? X extends Ok<infer Call, infer J2 extends number>
					? ParseItemColDefs<T, J2> extends infer D
						? D extends Ok<infer Defs, infer J3 extends number>
							? EatOp<T, J3, ","> extends never
								? EatOp<T, J3, ")"> extends never
									? Expected<'"," or ")"', T, J3>
									: Ok<
											[...Acc, { call: Call; colDefs: Defs }],
											EatOp<T, J3, ")">
										>
								: ParseRowsFromItems<
										T,
										EatOp<T, J3, ",">,
										[...Acc, { call: Call; colDefs: Defs }]
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
					{
						t: "sub";
						q: {
							t: "select";
							with: null;
							body: {
								t: "simple";
								distinct: false;
								targets: [{ e: { t: "star"; tbl: null }; alias: null }];
								from: [F];
								where: null;
								groupBy: null;
								groupingSets: false;
								having: null;
								windows: [];
							};
							orderBy: [];
							limit: null;
							offset: null;
						};
						alias: Al;
						colAliases: CA;
						lateral: true;
					},
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
	infer N extends string,
]
	? { schema: null; name: N }
	: Parts extends readonly [infer S extends string, infer N extends string]
		? { schema: S; name: N }
		: Parts extends readonly [
					string,
					infer S extends string,
					infer N extends string,
				]
			? { schema: S; name: N }
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
						? X extends Ok<infer Defs, infer J extends number>
							? Ok<
									{
										t: "func";
										call: Call;
										alias: null;
										colAliases: null;
										colDefs: Defs;
										lateral: Lateral;
										withOrdinality: Ord;
									},
									J
								>
							: X
						: never
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
	ParseAliasChecked<T, I> extends infer AR
		? AR extends [infer A, infer CA, infer J extends number]
			? T[J] extends OpTok<"(">
				? Ord extends true
					? Fail<
							"WITH ORDINALITY cannot be used with a column definition list",
							J
						>
					: ParseColDefs<T, Nx<J>, []> extends infer X
						? X extends Ok<infer Defs, infer J2 extends number>
							? Ok<
									{
										t: "func";
										call: Call;
										alias: A;
										colAliases: null;
										colDefs: Defs;
										lateral: Lateral;
										withOrdinality: Ord;
									},
									J2
								>
							: X
						: never
				: Ok<
						{
							t: "func";
							call: Call;
							alias: A;
							colAliases: CA;
							colDefs: null;
							lateral: Lateral;
							withOrdinality: Ord;
						},
						J
					>
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
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? ParseTypeName<T, J> extends infer X
			? X extends Ok<infer Ty extends string, infer J2 extends number>
				? EatOp<T, J2, ","> extends never
					? EatOp<T, J2, ")"> extends never
						? Expected<'"," or ")"', T, J2>
						: Ok<[...Acc, { name: N; type: Ty }], EatOp<T, J2, ")">>
					: ParseColDefs<T, EatOp<T, J2, ",">, [...Acc, { name: N; type: Ty }]>
				: X
			: never
		: Expected<"column definition", T, I>;

/**
 * `[AS] alias [(col, ...)]` → `[alias | null, colAliases | null, next]`.
 * Table aliases are `ColId`s even after AS (`AS order`, `AS left` are syntax errors in Postgres).
 */
export type ParseAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? ColIdIdent<T, Nx<I>> extends [
				infer A extends string,
				infer J extends number,
			]
			? ParseColAliases<T, A, J>
			: [null, null, I]
		: ColIdIdent<T, I> extends [infer A extends string, infer J extends number]
			? ParseColAliases<T, A, J>
			: [null, null, I];
/** `ParseAlias`, but `AS` followed by something that cannot be a table alias (`AS order`) is a syntax error there. */
export type ParseAliasChecked<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? ColIdIdent<T, Nx<I>> extends [string, number]
			? ParseAlias<T, I>
			: SyntaxErrorAt<T, Nx<I>>
		: ParseAlias<T, I>;
type ParseColAliases<T extends Toks, A extends string, I extends number> =
	T[I] extends OpTok<"(">
		? ParenIdentList<T, I> extends Ok<
				infer Cols extends readonly string[],
				infer J extends number
			>
			? [A, Cols, J]
			: [A, null, I]
		: [A, null, I];

export type ParseJoins<T extends Toks, L, I extends number> =
	T[I] extends WordTok<"cross">
		? T[Nx<I>] extends WordTok<"join">
			? ParseJoinRhs<T, L, "cross", false, Nx<Nx<I>>>
			: Expected<"JOIN", T, Nx<I>>
		: T[I] extends WordTok<"natural">
			? ParseJoinKind<T, Nx<I>> extends [
					infer K extends JoinKind,
					infer J extends number,
				]
				? ParseJoinRhs<T, L, K, true, J>
				: Expected<"JOIN", T, Nx<I>>
			: ParseJoinKind<T, I> extends [
						infer K extends JoinKind,
						infer J extends number,
					]
				? ParseJoinRhs<T, L, K, false, J>
				: Ok<L, I>;

/** `[INNER | LEFT | RIGHT | FULL] [OUTER] JOIN` → `[kind, next]` or null. */
type ParseJoinKind<T extends Toks, I extends number> =
	T[I] extends WordTok<"join">
		? ["inner", Nx<I>]
		: T[I] extends WordTok<"inner">
			? T[Nx<I>] extends WordTok<"join">
				? ["inner", Nx<Nx<I>>]
				: null
			: T[I] extends WordTok<infer K extends "left" | "right" | "full">
				? T[Nx<I>] extends WordTok<"outer">
					? T[Nx<Nx<I>>] extends WordTok<"join">
						? [K, Nx<Nx<Nx<I>>>]
						: null
					: T[Nx<I>] extends WordTok<"join">
						? [K, Nx<Nx<I>>]
						: null
				: null;

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
		? X extends Ok<infer Rt, infer J extends number>
			? K extends "cross"
				? ParseJoins<
						T,
						{
							t: "join";
							kind: "cross";
							l: L;
							r: Rt;
							on: null;
							using: null;
							natural: false;
						},
						J
					>
				: Natural extends true
					? ParseJoins<
							T,
							{
								t: "join";
								kind: K;
								l: L;
								r: Rt;
								on: null;
								using: null;
								natural: true;
							},
							J
						>
					: T[J] extends WordTok<"on" | "using">
						? ParseJoinQual<T, L, K, Rt, J>
						: ParseJoins<T, Rt, J> extends infer Y
							? Y extends Ok<infer Rt2, infer J2 extends number>
								? J2 extends J
									? Expected<"ON or USING", T, J>
									: ParseJoinQual<T, L, K, Rt2, J2>
								: Y
							: never
			: X
		: never;
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
				? U extends Ok<infer Cols, infer J2 extends number>
					? ParseJoins<
							T,
							{
								t: "join";
								kind: K;
								l: L;
								r: Rt;
								on: null;
								using: Cols;
								natural: false;
							},
							SkipUsingAlias<T, J2>
						>
					: U
				: never
		: ParseExpr<T, EatWord<T, J, "on">, 0> extends infer On
			? On extends Ok<infer Cond, infer J2 extends number>
				? ParseJoins<
						T,
						{
							t: "join";
							kind: K;
							l: L;
							r: Rt;
							on: Cond;
							using: null;
							natural: false;
						},
						J2
					>
				: On
			: never;
/** `USING (...) AS join_alias` (PG 14+): the alias is accepted but not bound. */
type SkipUsingAlias<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? T[Nx<I>] extends WordTok | IdTok
			? Nx<Nx<I>>
			: I
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

type ParseGroupItems<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends boolean,
> =
	T[I] extends WordTok<"rollup" | "cube">
		? T[Nx<I>] extends OpTok<"(">
			? ParseExprList<T, Nx<Nx<I>>, []> extends infer X
				? X extends Ok<
						infer Items extends readonly unknown[],
						infer J extends number
					>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: GroupNext<T, EatOp<T, J, ")">, [...Acc, ...Items], true>
					: X
				: never
			: Expected<'"("', T, Nx<I>>
		: T[I] extends WordTok<"grouping">
			? T[Nx<I>] extends WordTok<"sets">
				? T[Nx<Nx<I>>] extends OpTok<"(">
					? GroupNext<T, SkipToCloseParen<T, Nx<Nx<Nx<I>>>>, Acc, true>
					: Expected<'"("', T, Nx<Nx<I>>>
				: ParseGroupExpr<T, I, Acc, Sets>
			: T[I] extends OpTok<"(">
				? T[Nx<I>] extends OpTok<")">
					? GroupNext<T, Nx<Nx<I>>, Acc, true>
					: ParseGroupExpr<T, I, Acc, Sets>
				: ParseGroupExpr<T, I, Acc, Sets>;
type ParseGroupExpr<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends boolean,
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J extends number>
			? GroupNext<T, J, [...Acc, E], Sets>
			: X
		: never;
type GroupNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Sets extends boolean,
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
	ColIdIdent<T, I> extends [infer Name extends string, infer J extends number]
		? EatWord<T, J, "as"> extends never
			? Expected<"AS", T, J>
			: EatOp<T, EatWord<T, J, "as">, "("> extends never
				? Expected<'"("', T, EatWord<T, J, "as">>
				: ParseWindowSpec<T, EatOp<T, EatWord<T, J, "as">, "(">> extends infer X
					? X extends Ok<infer Spec, infer J2 extends number>
						? EatOp<T, J2, ","> extends never
							? Ok<[...Acc, { name: Name; spec: Spec }], J2>
							: ParseWindowDefs<
									T,
									EatOp<T, J2, ",">,
									[...Acc, { name: Name; spec: Spec }]
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
	Ident<T, I> extends [infer Name extends string, infer J extends number]
		? ParseCteCols<T, J> extends [infer Cols, infer J2 extends number]
			? EatWord<T, J2, "as"> extends never
				? Expected<"AS", T, J2>
				: EatOp<T, SkipMaterialized<T, EatWord<T, J2, "as">>, "("> extends never
					? Expected<'"("', T, SkipMaterialized<T, EatWord<T, J2, "as">>>
					: ParseStatement<
								T,
								EatOp<T, SkipMaterialized<T, EatWord<T, J2, "as">>, "(">,
								false
							> extends infer X
						? X extends Ok<infer S, infer J3 extends number>
							? EatOp<T, J3, ")"> extends never
								? Expected<'")"', T, J3>
								: T[EatOp<T, J3, ")">] extends WordTok<"search" | "cycle">
									? ParseSearchCycle<T, EatOp<T, J3, ")">> extends infer SC
										? SC extends Ok<
												[infer Search, infer Cycle],
												infer J4 extends number
											>
											? CteNext<
													T,
													J4,
													[
														...Acc,
														{
															name: Name;
															cols: Cols;
															q: S;
															search: Search;
															cycle: Cycle;
														},
													],
													Rec
												>
											: SC
										: never
									: CteNext<
											T,
											EatOp<T, J3, ")">,
											[
												...Acc,
												{
													name: Name;
													cols: Cols;
													q: S;
													search: null;
													cycle: null;
												},
											],
											Rec
										>
							: X
						: never
			: never
		: Expected<"CTE name", T, I>;
type CteNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Rec extends boolean,
> =
	EatOp<T, I, ","> extends never
		? Ok<{ recursive: Rec; ctes: Acc }, I>
		: ParseCtes<T, EatOp<T, I, ",">, Acc, Rec>;
type ParseCteCols<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParenIdentList<T, I> extends Ok<
				infer Cols extends readonly string[],
				infer J extends number
			>
			? [Cols, J]
			: [null, I]
		: [null, I];
type SkipMaterialized<T extends Toks, I extends number> =
	EatWords<T, I, ["not", "materialized"]> extends never
		? SkipWord<T, I, "materialized">
		: EatWords<T, I, ["not", "materialized"]>;

/** `[SEARCH ...] [CYCLE ...]` after a CTE's `)` → `Ok<[search | null, cycle | null], next>`. */
type ParseSearchCycle<T extends Toks, I extends number> =
	ParseCteSearch<T, I> extends infer S
		? S extends Ok<infer Search, infer J extends number>
			? ParseCteCycle<T, J> extends infer C
				? C extends Ok<infer Cycle, infer J2 extends number>
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
					? X extends Ok<infer Cols, infer J extends number>
						? ParseSetCol<T, J> extends infer SC
							? SC extends Ok<infer Set, infer J2 extends number>
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
			? X extends Ok<infer Cols, infer J extends number>
				? ParseSetCol<T, J> extends infer SC
					? SC extends Ok<infer Mark, infer J2 extends number>
						? T[J2] extends WordTok<"to">
							? ParseCycleConst<T, Nx<J2>> extends infer V
								? V extends Ok<infer To, infer J3 extends number>
									? EatWord<T, J3, "default"> extends never
										? Expected<"DEFAULT", T, J3>
										: ParseCycleConst<
													T,
													EatWord<T, J3, "default">
												> extends infer D
											? D extends Ok<infer Def, infer J4 extends number>
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
		: ColIdIdent<T, EatWord<T, I, "using">> extends [
					infer P extends string,
					infer J extends number,
				]
			? Ok<{ cols: Cols; set: Mark; to: To; default: Def; using: P }, J>
			: Expected<"column name", T, EatWord<T, I, "using">>;
/** `TO` / `DEFAULT` values are constants (`AexprConst`): numbers, strings, booleans, NULL, `type 'literal'`. */
type ParseCycleConst<T extends Toks, I extends number> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer E, number>
			? E extends { readonly t: "num" | "str" | "bool" | "null" | "typed" }
				? X
				: SyntaxErrorAt<T, I>
			: X
		: never;
type ParseSetCol<T extends Toks, I extends number> =
	EatWord<T, I, "set"> extends never
		? Expected<"SET", T, I>
		: ColIdIdent<T, EatWord<T, I, "set">> extends [
					infer N extends string,
					infer J extends number,
				]
			? Ok<N, J>
			: Expected<"column name", T, EatWord<T, I, "set">>;
/** `col, col, ...` (no parentheses) */
type ParseColIdList<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	ColIdIdent<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, N], J>
			: ParseColIdList<T, EatOp<T, J, ",">, [...Acc, N]>
		: Expected<"column name", T, I>;

export type { Cte, Expr, FromItem, SelectBody, Target };
