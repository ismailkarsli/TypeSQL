import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type {
	Expr,
	ReturningOpt,
	SetItem,
	TargetInd,
	WithClause,
} from "../ast.js";
import type { OpTok, WordTok } from "../lexer/tokens.js";
import type { ParseBracket, ParseExpr } from "./expr.js";
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
	Nx2,
	Nx3,
	Ok,
	QualName,
	SkipWord,
} from "./util.js";

export type ParseInsert<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	EatWord<T, I, "into"> extends never
		? Expected<"INTO", T, I>
		: ParseDmlTarget<T, Next<I>, "values" | "overriding", false> extends Ok<
					[infer Ref, infer Alias],
					infer I1
				>
			? ParseInsertColumns<T, I1> extends Ok<[infer Cols, infer Ind], infer I2>
				? ParseOverriding<T, I2> extends Ok<unknown, infer I3>
					? ParseInsertSource<
							T,
							I3,
							Cols extends null ? false : true
						> extends infer Src
						? Src extends Ok<infer Source, infer I4>
							? ParseOnConflictOpt<T, I4> extends Ok<infer Conf, infer I5>
								? ParseReturningOpt<T, I5> extends Ok<
										[infer Ret, infer Opts],
										infer I6
									>
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
									: ParseReturningOpt<T, I5>
								: ParseOnConflictOpt<T, I4>
							: Src
						: never
					: ParseOverriding<T, I2>
				: ParseInsertColumns<T, I1>
			: ParseDmlTarget<T, Next<I>, "values" | "overriding", false>;

type ParseInsertColumns<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? IsSelectStart<T, Next<I>> extends true
			? Ok<[null, null], I>
			: ParenTargetList<T, I>
		: Ok<[null, null], I>;

export type ParseOverriding<T extends Toks, I extends number> =
	EatWord<T, I, "overriding"> extends never
		? Ok<null, I>
		: EatWord<T, Next<I>, "system" | "user"> extends never
			? Expected<"SYSTEM or USER", T, Next<I>>
			: EatWord<T, Nx2<I>, "value"> extends never
				? Expected<"VALUE", T, Nx2<I>>
				: Ok<null, Nx3<I>>;

type ParseInsertSource<
	T extends Toks,
	I extends number,
	HasCols extends boolean,
> =
	T[I] extends WordTok<"values">
		? ParseValues<T, Next<I>>
		: T[I] extends WordTok<"default">
			? HasCols extends true
				? Fail<
						"syntax error at or near default: DEFAULT VALUES cannot be combined with a column list",
						I
					>
				: EatWord<T, Next<I>, "values"> extends never
					? Expected<"VALUES", T, Next<I>>
					: Ok<{ t: "default" }, Nx2<I>>
			: IsSelectStart<T, I> extends true
				? ParseSelectStmt<T, I> extends Ok<infer Q, infer J>
					? Ok<{ t: "select"; q: Q }, J>
					: ParseSelectStmt<T, I>
				: Expected<"VALUES, SELECT or DEFAULT VALUES", T, I>;

type ParseOnConflictOpt<T extends Toks, I extends number> =
	EatWords<T, I, ["on", "conflict"]> extends never
		? Ok<null, I>
		: ParseConflictTarget<T, Nx2<I>> extends Ok<unknown, infer J>
			? ParseConflictAction<T, J>
			: ParseConflictTarget<T, Nx2<I>>;

type ParseConflictTarget<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParseIndexParams<T, Next<I>> extends Ok<unknown, infer J>
			? EatWord<T, J, "where"> extends never
				? Ok<null, J>
				: ParseExpr<T, Next<J>, 0> extends Ok<unknown, infer J2>
					? Ok<null, J2>
					: ParseExpr<T, Next<J>, 0>
			: ParseIndexParams<T, Next<I>>
		: EatWords<T, I, ["on", "constraint"]> extends never
			? Ok<null, I>
			: Ident<T, Nx2<I>> extends [string, infer J extends number]
				? Ok<null, J>
				: Expected<"constraint name", T, Nx2<I>>;

type ParseIndexParams<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<unknown, infer J>
		? SkipOpClass<T, J> extends infer J2 extends number
			? T[J2] extends WordTok<"asc" | "desc">
				? Fail<"ASC/DESC is not allowed in ON CONFLICT clause", I>
				: T[J2] extends WordTok<"nulls">
					? Fail<"NULLS FIRST/LAST is not allowed in ON CONFLICT clause", I>
					: EatOp<T, J2, ","> extends never
						? EatOp<T, J2, ")"> extends never
							? Expected<'"," or ")"', T, J2>
							: Ok<null, Next<J2>>
						: ParseIndexParams<T, Next<J2>>
			: never
		: ParseExpr<T, I, 0>;
type SkipOpClass<T extends Toks, I extends number> =
	T[I] extends WordTok<"nulls">
		? I
		: Ident<T, I> extends [string, infer J]
			? J
			: I;

type ParseConflictAction<T extends Toks, I extends number> =
	EatWord<T, I, "do"> extends never
		? Expected<"DO", T, I>
		: EatWord<T, Next<I>, "nothing"> extends never
			? EatWords<T, Next<I>, ["update", "set"]> extends never
				? Expected<"NOTHING or UPDATE SET", T, Next<I>>
				: ParseSetList<T, Nx3<I>, []> extends infer X
					? X extends Ok<infer Set, infer J>
						? ParseWhereOpt<T, J> extends Ok<infer Where, infer J2>
							? Ok<{ t: "update"; set: Set; where: Where }, J2>
							: ParseWhereOpt<T, J>
						: X
					: never
			: Ok<{ t: "nothing" }, Nx2<I>>;

export type ParseUpdate<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	ParseDmlTarget<T, I, "set", true> extends Ok<
		[infer Ref, infer Alias],
		infer I1
	>
		? EatWord<T, I1, "set"> extends never
			? Expected<"SET", T, I1>
			: ParseSetList<T, Next<I1>, []> extends Ok<infer Set, infer I2>
				? ParseFromOpt<T, I2> extends Ok<infer From, infer I3>
					? ParseDmlWhere<T, I3> extends Ok<infer Where, infer I4>
						? ParseReturningOpt<T, I4> extends Ok<
								[infer Ret, infer Opts],
								infer I5
							>
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
							: ParseReturningOpt<T, I4>
						: ParseDmlWhere<T, I3>
					: ParseFromOpt<T, I2>
				: ParseSetList<T, Next<I1>, []>
		: ParseDmlTarget<T, I, "set", true>;

export type ParseSetList<
	T extends Toks,
	I extends number,
	Acc extends readonly SetItem[],
> =
	ParseSetItem<T, I> extends Ok<infer Item extends SetItem, infer J>
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, Item], J>
			: ParseSetList<T, Next<J>, [...Acc, Item]>
		: ParseSetItem<T, I>;

type ParseSetItem<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? ParenTargetList<T, I> extends Ok<[infer Cols, infer Ind], infer J>
			? EatOp<T, J, "="> extends never
				? Expected<'"="', T, J>
				: ParseExpr<T, Next<J>, 0> extends Ok<infer E, infer J2>
					? Ok<{ t: "setmulti"; cols: Cols; ind: Ind; e: E }, J2>
					: ParseExpr<T, Next<J>, 0>
			: ParenTargetList<T, I>
		: ParseAssignTarget<T, I> extends Ok<[infer Col, infer Ind], infer J>
			? EatOp<T, J, "="> extends never
				? Expected<'"="', T, J>
				: ParseExpr<T, Next<J>, 0> extends Ok<infer E, infer J2>
					? Ok<
							Ind extends Expr
								? { t: "setind"; col: Col; target: Ind; e: E }
								: { t: "set"; col: Col; e: E },
							J2
						>
					: ParseExpr<T, Next<J>, 0>
			: ParseAssignTarget<T, I>;

type ParseAssignTarget<T extends Toks, I extends number> =
	Ident<T, I> extends [infer Col extends string, infer J extends number]
		? T[J] extends OpTok<"[" | ".">
			? ParseIndirection<T, J, [Col, I], { t: "col"; tbl: null; name: Col }>
			: Ok<[Col, null], J>
		: Expected<"column name", T, I>;

type ParseIndirection<
	T extends Toks,
	I extends number,
	Tg extends readonly [string, number],
	E,
> =
	T[I] extends OpTok<"[">
		? ParseBracket<T, E, Next<I>> extends Ok<infer N, infer J>
			? ParseIndirection<T, J, Tg, N>
			: ParseBracket<T, E, Next<I>>
		: T[I] extends OpTok<".">
			? T[Next<I>] extends OpTok<"*">
				? Fail<'row expansion via "*" is not supported here', Tg[1]>
				: AnyLabel<T, Next<I>> extends [infer N, infer J extends number]
					? ParseIndirection<T, J, Tg, { t: "field"; e: E; name: N }>
					: Expected<"field name", T, Next<I>>
			: Ok<[Tg[0], E], I>;

export type ParenTargetList<T extends Toks, I extends number> = TargetListLoop<
	T,
	Next<I>,
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
	ParseAssignTarget<T, I> extends Ok<
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
						Next<J>
					>
			: TargetListLoop<
					T,
					Next<J>,
					[...Cols, N],
					[...Inds, Ind],
					Ind extends null ? Any : true
				>
		: ParseAssignTarget<T, I>;

export type ParseDelete<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	EatWord<T, I, "from"> extends never
		? Expected<"FROM", T, I>
		: ParseDmlTarget<T, Next<I>, never, true> extends Ok<
					[infer Ref, infer Alias],
					infer I1
				>
			? ParseUsingOpt<T, I1> extends Ok<infer Using, infer I2>
				? ParseDmlWhere<T, I2> extends Ok<infer Where, infer I3>
					? ParseReturningOpt<T, I3> extends Ok<
							[infer Ret, infer Opts],
							infer I4
						>
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
						: ParseReturningOpt<T, I3>
					: ParseDmlWhere<T, I2>
				: ParseUsingOpt<T, I1>
			: ParseDmlTarget<T, Next<I>, never, true>;

type ParseUsingOpt<T extends Toks, I extends number> =
	EatWord<T, I, "using"> extends never
		? Ok<[], I>
		: ParseFromList<T, Next<I>, []>;

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
				Star extends true ? (T[J] extends OpTok<"*"> ? Next<J> : J) : J,
				Stop
			> extends infer A
			? A extends Ok<infer Alias, infer J2>
				? Ok<[RefOf<Parts>, Alias], J2>
				: A
			: never
		: Expected<"table name", T, SkipWord<T, I, "only">>;

type ParseDmlAlias<T extends Toks, I extends number, Stop extends string> =
	T[I] extends WordTok<"as">
		? Ident<T, Next<I>> extends [infer A, infer J extends number]
			? Ok<A, J>
			: Expected<"alias", T, Next<I>>
		: Ident<T, I> extends [infer A, infer J extends number]
			? A extends Stop
				? Ok<null, I>
				: Ok<A, J>
			: Ok<null, I>;

type ParseDmlWhere<T extends Toks, I extends number> =
	EatWords<T, I, ["where", "current", "of"]> extends never
		? ParseWhereOpt<T, I>
		: Ident<T, Nx3<I>> extends [string, infer J extends number]
			? Ok<null, J>
			: Expected<"cursor name", T, Nx3<I>>;

export type ParseReturningOpt<T extends Toks, I extends number> =
	EatWord<T, I, "returning"> extends never
		? Ok<[null, []], I>
		: EatWord<T, Next<I>, "with"> extends never
			? ReturningTargets<T, Next<I>, []>
			: EatOp<T, Nx2<I>, "("> extends never
				? Expected<'"("', T, Nx2<I>>
				: ParseReturningOpts<T, Nx3<I>, []>;

type ReturningTargets<
	T extends Toks,
	I extends number,
	Opts extends readonly ReturningOpt[],
> =
	ParseTargetList<T, I, []> extends Ok<infer Ts, infer J>
		? Ok<[Ts, Opts], J>
		: ParseTargetList<T, I, []>;

type ParseReturningOpts<
	T extends Toks,
	I extends number,
	Acc extends readonly ReturningOpt[],
> =
	T[I] extends WordTok<infer K extends "old" | "new">
		? EatWord<T, Next<I>, "as"> extends never
			? Expected<"AS", T, Next<I>>
			: Ident<T, Nx2<I>> extends [
						infer A extends string,
						infer J extends number,
					]
				? EatOp<T, J, ","> extends never
					? EatOp<T, J, ")"> extends never
						? Expected<'"," or ")"', T, J>
						: ReturningTargets<T, Next<J>, [...Acc, { kind: K; alias: A }]>
					: ParseReturningOpts<T, Next<J>, [...Acc, { kind: K; alias: A }]>
				: Expected<"alias", T, Nx2<I>>
		: Expected<"OLD or NEW", T, I>;
