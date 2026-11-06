import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { Expr, MergeWhen, WithClause } from "../ast.js";
import type { OpTok, WordTok } from "../lexer/tokens.js";
import type {
	ParenTargetList,
	ParseDmlTarget,
	ParseOverriding,
	ParseReturningOpt,
	ParseSetList,
} from "./dml.js";
import type { ParseExpr, ParseExprList } from "./expr.js";
import type { ParseFromItem } from "./select.js";
import type {
	Close,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Nx2,
	Ok,
	SkipWords,
	SyntaxErrorAt,
} from "./util.js";

export type ParseMerge<
	T extends Toks,
	I extends number,
	W extends WithClause | null,
> =
	EatWord<T, I, "into"> extends never
		? Expected<"INTO", T, I>
		: ParseDmlTarget<T, Next<I>, never, true> extends Ok<
					[infer Ref, infer Alias],
					infer I1
				>
			? EatWord<T, I1, "using"> extends never
				? Expected<"USING", T, I1>
				: ParseFromItem<T, Next<I1>> extends Ok<infer Source, infer I2>
					? EatWord<T, I2, "on"> extends never
						? Expected<"ON", T, I2>
						: ParseExpr<T, Next<I2>, 0> extends Ok<infer Cond, infer I3>
							? T[I3] extends WordTok<"when">
								? ParseWhens<T, I3, []> extends Ok<infer Whens, infer I4>
									? ParseReturningOpt<T, I4> extends Ok<
											[infer Ret, infer Opts],
											infer I5
										>
										? Ok<
												{
													t: "merge";
													with: W;
													table: Ref;
													alias: Alias;
													source: Source;
													on: Cond;
													whens: Whens;
													returning: Ret;
													retOpts: Opts;
												},
												I5
											>
										: ParseReturningOpt<T, I4>
									: ParseWhens<T, I3, []>
								: Expected<"WHEN", T, I3>
							: ParseExpr<T, Next<I2>, 0>
					: ParseFromItem<T, Next<I1>>
			: ParseDmlTarget<T, Next<I>, never, true>;

type ParseWhens<
	T extends Toks,
	I extends number,
	Acc extends readonly MergeWhen[],
> =
	T[I] extends WordTok<"when">
		? ParseWhen<T, Next<I>> extends Ok<infer When extends MergeWhen, infer J>
			? ParseWhens<T, J, [...Acc, When]>
			: ParseWhen<T, Next<I>>
		: Ok<Acc, I>;

type ParseWhen<T extends Toks, I extends number> =
	EatWord<T, I, "matched"> extends never
		? EatWords<T, I, ["not", "matched"]> extends never
			? Expected<"MATCHED or NOT MATCHED", T, I>
			: EatWords<T, Nx2<I>, ["by", "source"]> extends never
				? ParseWhenCond<T, SkipWords<T, Nx2<I>, ["by", "target"]>, "target">
				: ParseWhenCond<T, Nx2<Nx2<I>>, "source">
		: ParseWhenCond<T, Next<I>, "matched">;
type ParseWhenCond<
	T extends Toks,
	I extends number,
	M extends MergeWhen["match"],
> =
	EatWord<T, I, "and"> extends never
		? ParseThen<T, I, M, null>
		: ParseExpr<T, Next<I>, 0> extends Ok<infer Cond extends Expr, infer J>
			? ParseThen<T, J, M, Cond>
			: ParseExpr<T, Next<I>, 0>;

type ParseThen<
	T extends Toks,
	I extends number,
	M extends MergeWhen["match"],
	Cond extends Expr | null,
> =
	EatWord<T, I, "then"> extends never
		? Expected<"THEN", T, I>
		: ParseAction<T, Next<I>, M> extends Ok<infer A, infer J>
			? Ok<{ match: M; cond: Cond; action: A }, J>
			: ParseAction<T, Next<I>, M>;

type ParseAction<
	T extends Toks,
	I extends number,
	M extends MergeWhen["match"],
> =
	EatWords<T, I, ["do", "nothing"]> extends never
		? M extends "target"
			? EatWord<T, I, "insert"> extends never
				? T[I] extends WordTok<"do">
					? SyntaxErrorAt<T, Next<I>>
					: Expected<"INSERT or DO NOTHING", T, I>
				: ParseMergeInsert<T, Next<I>>
			: EatWord<T, I, "delete"> extends never
				? EatWords<T, I, ["update", "set"]> extends never
					? T[I] extends WordTok<"update" | "do">
						? SyntaxErrorAt<T, Next<I>>
						: Expected<"UPDATE, DELETE or DO NOTHING", T, I>
					: ParseSetList<T, Nx2<I>, []> extends infer X
						? X extends Ok<infer Set, infer J>
							? Ok<{ t: "update"; set: Set }, J>
							: X
						: never
				: Ok<{ t: "delete" }, Next<I>>
		: Ok<{ t: "nothing" }, Nx2<I>>;

type ParseMergeInsert<T extends Toks, I extends number> =
	EatWords<T, I, ["default", "values"]> extends never
		? (
				T[I] extends OpTok<"(">
					? ParenTargetList<T, I>
					: Ok<[null, null], I>
			) extends infer Cl
			? Cl extends Ok<[infer Cols, infer Ind], infer J>
				? ParseOverriding<T, J> extends Ok<unknown, infer J2>
					? EatWord<T, J2, "values"> extends never
						? Expected<"VALUES", T, J2>
						: EatOp<T, Next<J2>, "("> extends never
							? Expected<'"("', T, Next<J2>>
							: ParseExprList<T, Nx2<J2>, []> extends Ok<infer Vals, infer J3>
								? Close<
										T,
										J3,
										{
											t: "insert";
											columns: Cols;
											colInd: Ind;
											values: Vals;
										}
									>
								: ParseExprList<T, Nx2<J2>, []>
					: ParseOverriding<T, J>
				: Cl
			: never
		: Ok<{ t: "insert"; columns: null; colInd: null; values: null }, Nx2<I>>;
