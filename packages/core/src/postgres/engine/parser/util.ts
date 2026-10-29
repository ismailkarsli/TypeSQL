import type {
	AnyLabel,
	EatOp,
	Expected,
	Nx,
	Ok,
} from "../../../engine/parse.js";
import type { IdTok, OpTok, Toks, WordTok } from "../../../engine/tokens.js";
import type { NotColId, TypeFuncNameKeyword } from "./keywords.js";

export type Ident<T extends Toks, I extends number> =
	IdentName<T[I]> extends infer V extends string ? [V, Nx<I>] : null;

type IdentName<H> =
	H extends IdTok<infer V>
		? V
		: H extends WordTok<infer V>
			? V extends NotColId
				? null
				: V
			: null;

export type QualName<T extends Toks, I extends number> =
	Ident<T, I> extends [infer A extends string, infer I1 extends number]
		? QualParts<T, I1, [A]>
		: null;
type QualParts<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	EatOp<T, I, "."> extends never
		? [Acc, I]
		: AnyLabel<T, EatOp<T, I, ".">> extends [
					infer B extends string,
					infer J extends number,
				]
			? Acc extends readonly [unknown, unknown]
				? [[...Acc, B], J]
				: QualParts<T, J, [...Acc, B]>
			: [Acc, I];

export type FuncName<T extends Toks, I extends number> =
	FuncKeyword<T[I]> extends infer V extends string
		? T[Nx<I>] extends OpTok<"(">
			? [[V], Nx<I>]
			: null
		: QualName<T, I>;
type FuncKeyword<H> =
	H extends WordTok<infer V extends TypeFuncNameKeyword> ? V : null;

export type ParenIdentList<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: IdentListLoop<T, EatOp<T, I, "(">, []>;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? EatOp<T, J, ")"> extends never
				? Expected<'"," or ")"', T, J>
				: Ok<[...Acc, N], EatOp<T, J, ")">>
			: IdentListLoop<T, EatOp<T, J, ",">, [...Acc, N]>
		: Expected<"identifier", T, I>;

export type {
	AnyLabel,
	AtEnd,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Near,
	Nx,
	Nx2,
	Nx3,
	Ok,
	SkipToCloseParen,
	SkipWord,
	SkipWords,
	SyntaxErrorAt,
} from "../../../engine/parse.js";
