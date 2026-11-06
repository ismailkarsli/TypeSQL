import type { Digit } from "../../../engine/chars.js";
import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { IdTok, NumTok, OpTok, WordTok } from "../lexer/tokens.js";
import type { ParseExprList } from "./expr.js";
import type { NotTypeFuncName } from "./keywords.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Nx2,
	Nx3,
	Ok,
	SyntaxErrorAt,
} from "./util.js";

export type ParseTypeName<T extends Toks, I extends number> =
	ParseBaseType<T, I> extends Ok<infer Base extends string, infer J>
		? ParseArraySuffix<T, J, NormalizeTypeName<Base>>
		: ParseBaseType<T, I>;

type ParseBaseType<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? TypeModifiers<T, QualifiedTail<T, V, Next<I>>>
		: T[I] extends WordTok<infer W>
			? W extends "double"
				? EatWord<T, Next<I>, "precision"> extends never
					? Expected<"PRECISION", T, Next<I>>
					: Ok<"float8", Nx2<I>>
				: W extends "national"
					? EatWord<T, Next<I>, "character" | "char"> extends never
						? Expected<"CHARACTER", T, Next<I>>
						: ParseBaseType<T, Next<I>>
					: W extends "character" | "char" | "nchar"
						? EatWord<T, Next<I>, "varying"> extends never
							? OkAt<"bpchar", OptPrecision<T, Next<I>>>
							: OkAt<"varchar", OptPrecision<T, Nx2<I>>>
						: W extends "bit"
							? EatWord<T, Next<I>, "varying"> extends never
								? TypeModifiers<T, Ok<"bit", Next<I>>>
								: TypeModifiers<T, Ok<"varbit", Nx2<I>>>
							: W extends "timestamp" | "time"
								? OptPrecision<T, Next<I>> extends infer J extends number
									? WithTz<T, J, W>
									: OptPrecision<T, Next<I>>
								: W extends "interval"
									? OkAt<
											"interval",
											T[Next<I>] extends OpTok<"(">
												? ParsePrecision<T, Nx2<I>>
												: IntervalFields<T, Next<I>>
										>
									: W extends "float"
										? FloatPrecision<T, Next<I>>
										: W extends "setof"
											? ParseBaseType<T, Next<I>>
											: W extends NotTypeFuncName
												? W extends "dec" | "decimal" | "numeric"
													? TypeModifiers<T, Ok<W, Next<I>>>
													: W extends "varchar"
														? OkAt<W, OptPrecision<T, Next<I>>>
														: W extends ColNameTypeWord
															? Ok<W, Next<I>>
															: Expected<"type name", T, I>
												: TypeModifiers<T, QualifiedTail<T, W, Next<I>>>
			: Expected<"type name", T, I>;

type OkAt<Name extends string, J> = J extends number ? Ok<Name, J> : J;

type FloatPrecision<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? T[Next<I>] extends NumTok<infer P>
			? T[Nx2<I>] extends OpTok<")">
				? P extends SmallFloat
					? Ok<"float4", Nx3<I>>
					: P extends BigFloat
						? Ok<"float8", Nx3<I>>
						: Fail<
								P extends "0"
									? "precision for type float must be at least 1 bit"
									: "precision for type float must be less than 54 bits",
								Next<I>
							>
				: Expected<'")"', T, Nx2<I>>
			: Expected<"precision", T, Next<I>>
		: Ok<"float8", I>;
type SmallFloat =
	| Exclude<Digit, "0">
	| `1${Digit}`
	| `2${"0" | "1" | "2" | "3" | "4"}`;
type BigFloat =
	| `2${"5" | "6" | "7" | "8" | "9"}`
	| `${"3" | "4"}${Digit}`
	| `5${"0" | "1" | "2" | "3"}`;

type ColNameTypeWord =
	| "bigint"
	| "boolean"
	| "int"
	| "integer"
	| "json"
	| "real"
	| "smallint";

type QualifiedTail<T extends Toks, First extends string, I extends number> =
	EatOp<T, I, "."> extends never
		? Ok<First, I>
		: AnyLabel<T, Next<I>> extends [infer N, infer J extends number]
			? Ok<N, J>
			: Expected<"type name", T, Next<I>>;

type WithTz<T extends Toks, I extends number, W extends string> =
	EatWords<T, I, ["with", "time", "zone"]> extends never
		? EatWords<T, I, ["without", "time", "zone"]> extends never
			? Ok<W, I>
			: Ok<W, Nx3<I>>
		: Ok<`${W}tz`, Nx3<I>>;

type TypeModifiers<T extends Toks, R> =
	R extends Ok<infer N, infer J>
		? T[J] extends OpTok<"(">
			? ParseExprList<T, Next<J>, []> extends Ok<unknown, infer K>
				? T[K] extends OpTok<")">
					? Ok<N, Next<K>>
					: Expected<'")"', T, K>
				: ParseExprList<T, Next<J>, []>
			: R
		: R;

export type ParsePrecision<
	T extends Toks,
	I extends number,
> = T[I] extends NumTok
	? T[Next<I>] extends OpTok<")">
		? Nx2<I>
		: SyntaxErrorAt<T, Next<I>>
	: SyntaxErrorAt<T, I>;
type OptPrecision<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? ParsePrecision<T, Next<I>> : I;

type IntervalField = "year" | "month" | "day" | "hour" | "minute" | "second";
type IntervalTo = {
	year: "month";
	day: "hour" | "minute" | "second";
	hour: "minute" | "second";
	minute: "second";
};
export type IntervalFields<T extends Toks, I extends number> =
	T[I] extends WordTok<infer F extends IntervalField>
		? F extends "second"
			? OptPrecision<T, Next<I>>
			: T[Next<I>] extends WordTok<"to">
				? F extends keyof IntervalTo
					? T[Nx2<I>] extends WordTok<infer G extends IntervalTo[F]>
						? G extends "second"
							? OptPrecision<T, Nx3<I>>
							: Nx3<I>
						: SyntaxErrorAt<T, Nx2<I>>
					: SyntaxErrorAt<T, Next<I>>
				: Next<I>
		: I;

type ParseArraySuffix<T extends Toks, I extends number, Base extends string> =
	T[I] extends WordTok<"array">
		? T[Next<I>] extends OpTok<"[">
			? OkAt<Arr<Base>, NumThen<T, Nx2<I>, "]">>
			: Ok<Arr<Base>, Next<I>>
		: ArrayBounds<T, I, Base>;
type ArrayBounds<T extends Toks, I extends number, Base extends string> =
	T[I] extends OpTok<"[">
		? (
				T[Next<I>] extends OpTok<"]">
					? Nx2<I>
					: NumThen<T, Next<I>, "]">
			) extends infer J
			? J extends number
				? ArrayBounds<T, J, Arr<Base>>
				: J
			: never
		: Ok<Base, I>;
type NumThen<
	T extends Toks,
	I extends number,
	C extends string,
> = T[I] extends NumTok
	? T[Next<I>] extends OpTok<C>
		? Nx2<I>
		: SyntaxErrorAt<T, Next<I>>
	: SyntaxErrorAt<T, I>;
type Arr<Base extends string> = Base extends `${string}[]` ? Base : `${Base}[]`;
