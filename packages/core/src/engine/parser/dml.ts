import type {
	Expr,
	FromItem,
	InsertSource,
	OnConflict,
	ReturningOpt,
	SelectStmt,
	SetItem,
	TableRef,
	Target,
	TargetInd,
	WithClause,
} from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseExpr } from "./expr.js";
import type {
	IsSelectStart,
	ParseFromList,
	ParseFromOpt,
	ParseSelectStmt,
	ParseTargetList,
	ParseValues,
	ParseWhereOpt,
	RefOf,
} from "./select.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Ok,
	QualName,
	SkipWord,
} from "./util.js";

/**
 * DML parsers (index-based, see util.ts). Each receives the token tuple, the index
 * *after* the leading keyword (`INSERT` / `UPDATE` / `DELETE`) and the already-parsed
 * WITH clause (or null). Result: `Ok<InsertStmt | UpdateStmt | DeleteStmt, next>` or an
 * `SqlError` positioned at the offending token.
 *
 * Grammar covered:
 *
 *   INSERT INTO [ONLY] table [AS alias] [(target, ...)] [OVERRIDING {SYSTEM|USER} VALUE]
 *     { VALUES (...), ... | select | DEFAULT VALUES }
 *     [ON CONFLICT [(index_params) [WHERE pred] | ON CONSTRAINT name] DO { NOTHING | UPDATE SET ... [WHERE ...] }]
 *     [returning]
 *   UPDATE [ONLY] table [*] [AS alias] SET { target = expr | target = DEFAULT | (target, ...) = (e1, ...) | (target, ...) = (select) } [, ...]
 *     [FROM from_list] [WHERE cond | WHERE CURRENT OF cursor] [returning]
 *   DELETE FROM [ONLY] table [*] [AS alias] [USING from_list] [WHERE cond | WHERE CURRENT OF cursor] [returning]
 *
 *   target    = col [ [i] | [lo:hi] | .field ]...    (indirection: `TargetInd` in ast.ts)
 *   returning = RETURNING [WITH ({OLD | NEW} AS alias, ...)] target_list
 *
 * `DEFAULT VALUES` together with a column list is a syntax error. `WHERE CURRENT OF cursor`
 * is parsed as no WHERE clause (the cursor's row is not known at the type level).
 * The ON CONFLICT conflict target (index columns, predicate, constraint name) is parsed
 * for syntax and discarded: the AST carries no field for it.
 */

// ───────────────────────────── INSERT ─────────────────────────────

export type ParseInsert<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	EatWord<T, I, "into"> extends never
		? Expected<"INTO", T, I>
		: ParseDmlTarget<
					T,
					EatWord<T, I, "into">,
					"values" | "overriding",
					false
				> extends infer Tg
			? Tg extends Ok<[infer Ref, infer Alias], infer I1>
				? ParseInsertColumns<T, I1> extends infer Cl
					? Cl extends Ok<[infer Cols, infer Ind], infer I2>
						? ParseOverriding<T, I2> extends infer Ov
							? Ov extends Ok<unknown, infer I3>
								? ParseInsertSource<
										T,
										I3,
										Cols extends null ? false : true
									> extends infer Src
									? Src extends Ok<infer Source, infer I4>
										? ParseOnConflictOpt<T, I4> extends infer Oc
											? Oc extends Ok<infer Conf, infer I5>
												? ParseReturningOpt<T, I5> extends infer Rt
													? Rt extends Ok<[infer Ret, infer Opts], infer I6>
														? Ok<
																{
																	t: "insert";
																	with: W;
																	table: Ref;
																	alias: Alias;
																	columns: Cols;
																	colInd: Ind;
																	source: Source;
																	onConflict: Conf;
																	returning: Ret;
																	retOpts: Opts;
																},
																I6
															>
														: Rt
													: never
												: Oc
											: never
										: Src
									: never
								: Ov
							: never
						: Cl
					: never
				: Tg
			: never;

/** `(target, ...)` unless the parenthesis opens a sub-select (`INSERT INTO t (SELECT ...)`). */
type ParseInsertColumns<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? IsSelectStart<T, Nx<I>> extends true
			? Ok<[null, null], I>
			: ParenTargetList<T, I>
		: Ok<[null, null], I>;

/** `OVERRIDING {SYSTEM | USER} VALUE` (accepted and ignored). */
export type ParseOverriding<T extends Toks, I extends number> =
	EatWord<T, I, "overriding"> extends never
		? Ok<null, I>
		: EatWord<T, EatWord<T, I, "overriding">, "system" | "user"> extends never
			? Expected<"SYSTEM or USER", T, EatWord<T, I, "overriding">>
			: EatWord<
						T,
						EatWord<T, EatWord<T, I, "overriding">, "system" | "user">,
						"value"
					> extends never
				? Expected<
						"VALUE",
						T,
						EatWord<T, EatWord<T, I, "overriding">, "system" | "user">
					>
				: Ok<
						null,
						EatWord<
							T,
							EatWord<T, EatWord<T, I, "overriding">, "system" | "user">,
							"value"
						>
					>;

type ParseInsertSource<
	T extends Toks,
	I extends number,
	HasCols extends boolean,
> =
	T[I] extends WordTok<"values">
		? ParseValues<T, Nx<I>>
		: T[I] extends WordTok<"default">
			? HasCols extends true
				? Fail<
						"syntax error at or near default: DEFAULT VALUES cannot be combined with a column list",
						I
					>
				: EatWord<T, Nx<I>, "values"> extends never
					? Expected<"VALUES", T, Nx<I>>
					: Ok<{ t: "default" }, EatWord<T, Nx<I>, "values">>
			: IsSelectStart<T, I> extends true
				? ParseSelectStmt<T, I> extends infer X
					? X extends Ok<infer Q, infer J>
						? Ok<{ t: "select"; q: Q }, J>
						: X
					: never
				: Expected<"VALUES, SELECT or DEFAULT VALUES", T, I>;

// ─── ON CONFLICT ───

type ParseOnConflictOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["on", "conflict"]> extends never
		? Ok<null, I>
		: ParseConflictTarget<T, EatWords<T, I, ["on", "conflict"]>> extends infer X
			? X extends Ok<unknown, infer J>
				? ParseConflictAction<T, J>
				: X
			: never;

/** `(index_params) [WHERE predicate]` | `ON CONSTRAINT name` | nothing. Parsed and discarded. */
type ParseConflictTarget<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParseIndexParams<T, Nx<I>> extends infer X
			? X extends Ok<unknown, infer J>
				? EatWord<T, J, "where"> extends never
					? Ok<null, J>
					: ParseExpr<T, EatWord<T, J, "where">, 0> extends infer P
						? P extends Ok<unknown, infer J2>
							? Ok<null, J2>
							: P
						: never
				: X
			: never
		: EatWords<T, I, ["on", "constraint"]> extends never
			? Ok<null, I>
			: Ident<T, EatWords<T, I, ["on", "constraint"]>> extends [
						string,
						infer J extends number,
					]
				? Ok<null, J>
				: Expected<"constraint name", T, EatWords<T, I, ["on", "constraint"]>>;

/**
 * `expr [opclass], ...)` — `I` is just inside the paren. A sort order (`ASC`, `NULLS FIRST`)
 * parses but is rejected, as Postgres does for an ON CONFLICT target.
 */
type ParseIndexParams<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<unknown, infer J>
			? SkipOpClass<T, J> extends infer J2 extends number
				? T[J2] extends WordTok<"asc" | "desc">
					? Fail<"ASC/DESC is not allowed in ON CONFLICT clause", I>
					: T[J2] extends WordTok<"nulls">
						? Fail<"NULLS FIRST/LAST is not allowed in ON CONFLICT clause", I>
						: EatOp<T, J2, ","> extends never
							? EatOp<T, J2, ")"> extends never
								? Expected<'"," or ")"', T, J2>
								: Ok<null, EatOp<T, J2, ")">>
							: ParseIndexParams<T, EatOp<T, J2, ",">>
				: never
			: X
		: never;
/** An operator class name, if any (`NULLS` is the only following word that is not reserved). */
type SkipOpClass<T extends Toks, I extends number> =
	T[I] extends WordTok<"nulls">
		? I
		: Ident<T, I> extends [string, infer J]
			? J
			: I;

type ParseConflictAction<T extends Toks, I extends number> =
	EatWord<T, I, "do"> extends never
		? Expected<"DO", T, I>
		: EatWord<T, EatWord<T, I, "do">, "nothing"> extends never
			? EatWords<T, EatWord<T, I, "do">, ["update", "set"]> extends never
				? Expected<"NOTHING or UPDATE SET", T, EatWord<T, I, "do">>
				: ParseSetList<
							T,
							EatWords<T, EatWord<T, I, "do">, ["update", "set"]>,
							[]
						> extends infer X
					? X extends Ok<infer Set, infer J>
						? ParseWhereOpt<T, J> extends infer Wh
							? Wh extends Ok<infer Where, infer J2>
								? Ok<{ t: "update"; set: Set; where: Where }, J2>
								: Wh
							: never
						: X
					: never
			: Ok<{ t: "nothing" }, EatWord<T, EatWord<T, I, "do">, "nothing">>;

// ───────────────────────────── UPDATE ─────────────────────────────

export type ParseUpdate<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	ParseDmlTarget<T, I, "set", true> extends infer Tg
		? Tg extends Ok<[infer Ref, infer Alias], infer I1>
			? EatWord<T, I1, "set"> extends never
				? Expected<"SET", T, I1>
				: ParseSetList<T, EatWord<T, I1, "set">, []> extends infer St
					? St extends Ok<infer Set, infer I2>
						? ParseFromOpt<T, I2> extends infer Fr
							? Fr extends Ok<infer From, infer I3>
								? ParseDmlWhere<T, I3> extends infer Wh
									? Wh extends Ok<infer Where, infer I4>
										? ParseReturningOpt<T, I4> extends infer Rt
											? Rt extends Ok<[infer Ret, infer Opts], infer I5>
												? Ok<
														{
															t: "update";
															with: W;
															table: Ref;
															alias: Alias;
															set: Set;
															from: From;
															where: Where;
															returning: Ret;
															retOpts: Opts;
														},
														I5
													>
												: Rt
											: never
										: Wh
									: never
								: Fr
							: never
						: St
					: never
			: Tg
		: never;

/** `item [, item ...]` after `SET`. */
export type ParseSetList<
	T extends Toks,
	I extends number,
	Acc extends readonly SetItem[],
> =
	ParseSetItem<T, I> extends infer X
		? X extends Ok<infer Item extends SetItem, infer J>
			? EatOp<T, J, ","> extends never
				? Ok<[...Acc, Item], J>
				: ParseSetList<T, EatOp<T, J, ",">, [...Acc, Item]>
			: X
		: never;

/** `target = expr` (expr may be `DEFAULT`) or `(target, ...) = (e1, ...) | (select)`. */
type ParseSetItem<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParenTargetList<T, I> extends infer L
			? L extends Ok<[infer Cols, infer Ind], infer J>
				? EatOp<T, J, "="> extends never
					? Expected<'"="', T, J>
					: ParseExpr<T, EatOp<T, J, "=">, 0> extends infer X
						? X extends Ok<infer E, infer J2>
							? Ok<{ t: "setmulti"; cols: Cols; ind: Ind; e: E }, J2>
							: X
						: never
				: L
			: never
		: ParseAssignTarget<T, I> extends infer Tg
			? Tg extends Ok<[infer Col, infer Ind], infer J>
				? EatOp<T, J, "="> extends never
					? Expected<'"="', T, J>
					: ParseExpr<T, EatOp<T, J, "=">, 0> extends infer X
						? X extends Ok<infer E, infer J2>
							? Ok<
									Ind extends Expr
										? { t: "setind"; col: Col; target: Ind; e: E }
										: { t: "set"; col: Col; e: E },
									J2
								>
							: X
						: never
				: Tg
			: never;

// ─── assignment targets ───

/**
 * `col [indirection]` (`set_target` / `insert_column_item`) → `Ok<[col, TargetInd], next>`.
 * Indirection is `[i]`, `[lo:hi]` (either bound optional) and `.field`, repeated; it becomes an
 * expression over the bare column (`a[1].f` → field(idx(col a, 1), f)).
 */
export type ParseAssignTarget<T extends Toks, I extends number> =
	Ident<T, I> extends [infer Col extends string, infer J extends number]
		? T[J] extends OpTok<"[" | ".">
			? ParseIndirection<T, J, [Col, I], { t: "col"; tbl: null; name: Col }>
			: Ok<[Col, null], J>
		: Expected<"column name", T, I>;

/** `Tg`: the target column and its token. */
type ParseIndirection<
	T extends Toks,
	I extends number,
	Tg extends readonly [string, number],
	E,
> =
	T[I] extends OpTok<"[">
		? ParseIndSubscript<T, Nx<I>, Tg, E>
		: T[I] extends OpTok<".">
			? T[Nx<I>] extends OpTok<"*">
				? Fail<'row expansion via "*" is not supported here', Tg[1]>
				: AnyLabel<T, Nx<I>> extends [infer N, infer J extends number]
					? ParseIndirection<T, J, Tg, { t: "field"; e: E; name: N }>
					: Expected<"field name", T, Nx<I>>
			: Ok<[Tg[0], E], I>;

/** After `[`: `i]`, `lo:hi]`, `:hi]`, `lo:]`, `:]`. */
type ParseIndSubscript<
	T extends Toks,
	I extends number,
	Tg extends readonly [string, number],
	E,
> =
	EatOp<T, I, ":"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer Ix, infer J>
				? EatOp<T, J, "]"> extends never
					? EatOp<T, J, ":"> extends never
						? Expected<'"]"', T, J>
						: ParseIndSliceHi<T, EatOp<T, J, ":">, Tg, E, Ix>
					: ParseIndirection<T, EatOp<T, J, "]">, Tg, { t: "idx"; e: E; i: Ix }>
				: X
			: never
		: ParseIndSliceHi<T, EatOp<T, I, ":">, Tg, E, null>;
type ParseIndSliceHi<
	T extends Toks,
	I extends number,
	Tg extends readonly [string, number],
	E,
	Lo,
> =
	EatOp<T, I, "]"> extends never
		? ParseExpr<T, I, 0> extends infer X
			? X extends Ok<infer Hi, infer J>
				? EatOp<T, J, "]"> extends never
					? Expected<'"]"', T, J>
					: ParseIndirection<
							T,
							EatOp<T, J, "]">,
							Tg,
							{ t: "slice"; e: E; lo: Lo; hi: Hi }
						>
				: X
			: never
		: ParseIndirection<
				T,
				EatOp<T, I, "]">,
				Tg,
				{ t: "slice"; e: E; lo: Lo; hi: null }
			>;

/**
 * `(target, ...)` → `Ok<[cols, ind], next>`: the column names, and the indirection of each
 * (`null` when no target has any, the common case). Token `I` must be `(`.
 */
export type ParenTargetList<T extends Toks, I extends number> = TargetListLoop<
	T,
	Nx<I>,
	[],
	[],
	false
>;
type TargetListLoop<
	T extends Toks,
	I extends number,
	Cols extends readonly string[],
	Inds extends readonly TargetInd[],
	Any extends boolean,
> =
	ParseAssignTarget<T, I> extends infer X
		? X extends Ok<
				[infer N extends string, infer Ind extends TargetInd],
				infer J
			>
			? EatOp<T, J, ","> extends never
				? EatOp<T, J, ")"> extends never
					? Expected<'"," or ")"', T, J>
					: Ok<
							[
								[...Cols, N],
								Any extends true
									? [...Inds, Ind]
									: Ind extends null
										? null
										: [...Inds, Ind],
							],
							EatOp<T, J, ")">
						>
				: TargetListLoop<
						T,
						EatOp<T, J, ",">,
						[...Cols, N],
						[...Inds, Ind],
						Ind extends null ? Any : true
					>
			: X
		: never;

// ───────────────────────────── DELETE ─────────────────────────────

export type ParseDelete<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	EatWord<T, I, "from"> extends never
		? Expected<"FROM", T, I>
		: ParseDmlTarget<T, EatWord<T, I, "from">, never, true> extends infer Tg
			? Tg extends Ok<[infer Ref, infer Alias], infer I1>
				? ParseUsingOpt<T, I1> extends infer Us
					? Us extends Ok<infer Using, infer I2>
						? ParseDmlWhere<T, I2> extends infer Wh
							? Wh extends Ok<infer Where, infer I3>
								? ParseReturningOpt<T, I3> extends infer Rt
									? Rt extends Ok<[infer Ret, infer Opts], infer I4>
										? Ok<
												{
													t: "delete";
													with: W;
													table: Ref;
													alias: Alias;
													using: Using;
													where: Where;
													returning: Ret;
													retOpts: Opts;
												},
												I4
											>
										: Rt
									: never
								: Wh
							: never
						: Us
					: never
				: Tg
			: never;

type ParseUsingOpt<T extends Toks, I extends number> =
	EatWord<T, I, "using"> extends never
		? Ok<[], I>
		: ParseFromList<T, EatWord<T, I, "using">, []>;

// ───────────────────────────── shared ─────────────────────────────

/**
 * `[ONLY] qualified_name [*] [AS alias | alias]` → `Ok<[ref, alias], next>` (the inheritance
 * `*` only where `Star` is true: UPDATE, DELETE and MERGE, not INSERT).
 * `Stop` lists unreserved words that follow the table name in this statement and must
 * not be taken as a bare alias (`UPDATE t SET`, `INSERT INTO t VALUES`).
 */
export type ParseDmlTarget<
	T extends Toks,
	I extends number,
	Stop extends string,
	Star extends boolean,
> =
	QualName<T, SkipWord<T, I, "only">> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseDmlAlias<
				T,
				Star extends true ? (T[J] extends OpTok<"*"> ? Nx<J> : J) : J,
				Stop
			> extends infer A
			? A extends Ok<infer Alias, infer J2>
				? Ok<[RefOf<Parts>, Alias], J2>
				: A
			: never
		: Expected<"table name", T, SkipWord<T, I, "only">>;

type ParseDmlAlias<T extends Toks, I extends number, Stop extends string> =
	T[I] extends WordTok<"as">
		? Ident<T, Nx<I>> extends [infer A, infer J extends number]
			? Ok<A, J>
			: Expected<"alias", T, Nx<I>>
		: Ident<T, I> extends [infer A, infer J extends number]
			? A extends Stop
				? Ok<null, I>
				: Ok<A, J>
			: Ok<null, I>;

/** `WHERE cond` or `WHERE CURRENT OF cursor` (no condition the types can use: `null`). */
type ParseDmlWhere<T extends Toks, I extends number> =
	EatWords<T, I, ["where", "current", "of"]> extends never
		? ParseWhereOpt<T, I>
		: Ident<T, EatWords<T, I, ["where", "current", "of"]>> extends [
					string,
					infer J extends number,
				]
			? Ok<null, J>
			: Expected<"cursor name", T, EatWords<T, I, ["where", "current", "of"]>>;

/** `[RETURNING [WITH ({OLD | NEW} AS alias, ...)] target_list]` → `Ok<[targets | null, options], next>`. */
export type ParseReturningOpt<T extends Toks, I extends number> =
	EatWord<T, I, "returning"> extends never
		? Ok<[null, []], I>
		: EatWord<T, EatWord<T, I, "returning">, "with"> extends never
			? ReturningTargets<T, EatWord<T, I, "returning">, []>
			: EatOp<
						T,
						EatWord<T, EatWord<T, I, "returning">, "with">,
						"("
					> extends never
				? Expected<'"("', T, EatWord<T, EatWord<T, I, "returning">, "with">>
				: ParseReturningOpts<
						T,
						EatOp<T, EatWord<T, EatWord<T, I, "returning">, "with">, "(">,
						[]
					>;

type ReturningTargets<
	T extends Toks,
	I extends number,
	Opts extends readonly ReturningOpt[],
> =
	ParseTargetList<T, I, []> extends infer X
		? X extends Ok<infer Ts, infer J>
			? Ok<[Ts, Opts], J>
			: X
		: never;

/** `{OLD | NEW} AS alias [, ...] )`, then the target list. */
type ParseReturningOpts<
	T extends Toks,
	I extends number,
	Acc extends readonly ReturningOpt[],
> =
	T[I] extends WordTok<infer K extends "old" | "new">
		? EatWord<T, Nx<I>, "as"> extends never
			? Expected<"AS", T, Nx<I>>
			: Ident<T, EatWord<T, Nx<I>, "as">> extends [
						infer A extends string,
						infer J extends number,
					]
				? EatOp<T, J, ","> extends never
					? EatOp<T, J, ")"> extends never
						? Expected<'"," or ")"', T, J>
						: ReturningTargets<
								T,
								EatOp<T, J, ")">,
								[...Acc, { kind: K; alias: A }]
							>
					: ParseReturningOpts<
							T,
							EatOp<T, J, ",">,
							[...Acc, { kind: K; alias: A }]
						>
				: Expected<"alias", T, EatWord<T, Nx<I>, "as">>
		: Expected<"OLD or NEW", T, I>;
