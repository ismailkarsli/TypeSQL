import type {
	IdTok,
	NumTok,
	OpTok,
	Toks,
	WordTok,
} from "../../../engine/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { ParseExprList } from "./expr.js";
import type { NotTypeFuncName } from "./keywords.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Nx,
	Nx2,
	Nx3,
	Ok,
	SyntaxErrorAt,
} from "./util.js";

export type ParseTypeName<T extends Toks, I extends number> =
	ParseBaseType<T, I> extends infer R
		? R extends Ok<infer Base extends string, infer J>
			? ParseArraySuffix<
					T,
					J,
					Base extends "char" ? Base : NormalizeTypeName<Base>
				>
			: R
		: never;

type ParseBaseType<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? TypeModifiers<T, QualifiedTail<T, V, Nx<I>>>
		: T[I] extends WordTok<infer W>
			? W extends "double"
				? EatWord<T, Nx<I>, "precision"> extends never
					? Expected<"PRECISION", T, Nx<I>>
					: Ok<"float8", EatWord<T, Nx<I>, "precision">>
				: W extends "national"
					? EatWord<T, Nx<I>, "character" | "char"> extends never
						? Expected<"CHARACTER", T, Nx<I>>
						: ParseBaseType<T, Nx<I>>
					: W extends "character" | "char" | "nchar"
						? EatWord<T, Nx<I>, "varying"> extends never
							? OkAt<"bpchar", OptPrecision<T, Nx<I>>>
							: OkAt<"varchar", OptPrecision<T, EatWord<T, Nx<I>, "varying">>>
						: W extends "bit"
							? EatWord<T, Nx<I>, "varying"> extends never
								? TypeModifiers<T, Ok<"bit", Nx<I>>>
								: TypeModifiers<T, Ok<"varbit", EatWord<T, Nx<I>, "varying">>>
							: W extends "timestamp" | "time"
								? OptPrecision<T, Nx<I>> extends infer J
									? J extends number
										? WithTz<T, J, W>
										: J
									: never
								: W extends "interval"
									? OkAt<
											"interval",
											T[Nx<I>] extends OpTok<"(">
												? ParsePrecision<T, Nx2<I>>
												: IntervalFields<T, Nx<I>>
										>
									: W extends "float"
										? FloatPrecision<T, Nx<I>>
										: W extends "setof"
											? ParseBaseType<T, Nx<I>>
											: W extends NotTypeFuncName
												? W extends "dec" | "decimal" | "numeric"
													? TypeModifiers<T, Ok<W, Nx<I>>>
													: W extends "varchar"
														? OkAt<W, OptPrecision<T, Nx<I>>>
														: W extends ColNameTypeWord
															? Ok<W, Nx<I>>
															: Expected<"type name", T, I>
												: TypeModifiers<T, QualifiedTail<T, W, Nx<I>>>
			: Expected<"type name", T, I>;

type OkAt<Name extends string, J> = J extends number ? Ok<Name, J> : J;

type FloatPrecision<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? T[Nx<I>] extends NumTok<infer P>
			? T[Nx2<I>] extends OpTok<")">
				? P extends SmallFloat
					? Ok<"float4", Nx3<I>>
					: P extends BigFloat
						? Ok<"float8", Nx3<I>>
						: Fail<
								P extends "0"
									? "precision for type float must be at least 1 bit"
									: "precision for type float must be less than 54 bits",
								Nx<I>
							>
				: Expected<'")"', T, Nx2<I>>
			: Expected<"precision", T, Nx<I>>
		: Ok<"float8", I>;
type SmallFloat =
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "10"
	| "11"
	| "12"
	| "13"
	| "14"
	| "15"
	| "16"
	| "17"
	| "18"
	| "19"
	| "20"
	| "21"
	| "22"
	| "23"
	| "24";
type BigFloat =
	| "25"
	| "26"
	| "27"
	| "28"
	| "29"
	| "30"
	| "31"
	| "32"
	| "33"
	| "34"
	| "35"
	| "36"
	| "37"
	| "38"
	| "39"
	| "40"
	| "41"
	| "42"
	| "43"
	| "44"
	| "45"
	| "46"
	| "47"
	| "48"
	| "49"
	| "50"
	| "51"
	| "52"
	| "53";

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
		: AnyLabel<T, EatOp<T, I, ".">> extends [infer N, infer J extends number]
			? Ok<N, J>
			: Expected<"type name", T, EatOp<T, I, ".">>;

type WithTz<T extends Toks, I extends number, W extends string> =
	EatWords<T, I, ["with", "time", "zone"]> extends never
		? EatWords<T, I, ["without", "time", "zone"]> extends never
			? Ok<W, I>
			: Ok<W, EatWords<T, I, ["without", "time", "zone"]>>
		: Ok<`${W}tz`, EatWords<T, I, ["with", "time", "zone"]>>;

type TypeModifiers<T extends Toks, R> =
	R extends Ok<infer N, infer J>
		? T[J] extends OpTok<"(">
			? ParseExprList<T, Nx<J>, []> extends infer X
				? X extends Ok<unknown, infer K>
					? T[K] extends OpTok<")">
						? Ok<N, Nx<K>>
						: Expected<'")"', T, K>
					: X
				: never
			: R
		: R;

export type ParsePrecision<
	T extends Toks,
	I extends number,
> = T[I] extends NumTok
	? T[Nx<I>] extends OpTok<")">
		? Nx2<I>
		: SyntaxErrorAt<T, Nx<I>>
	: SyntaxErrorAt<T, I>;
type OptPrecision<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? ParsePrecision<T, Nx<I>> : I;

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
			? OptPrecision<T, Nx<I>>
			: T[Nx<I>] extends WordTok<"to">
				? F extends keyof IntervalTo
					? T[Nx2<I>] extends WordTok<infer G extends IntervalTo[F]>
						? G extends "second"
							? OptPrecision<T, Nx3<I>>
							: Nx3<I>
						: SyntaxErrorAt<T, Nx2<I>>
					: SyntaxErrorAt<T, Nx<I>>
				: Nx<I>
		: I;

type ParseArraySuffix<T extends Toks, I extends number, Base extends string> =
	T[I] extends WordTok<"array">
		? T[Nx<I>] extends OpTok<"[">
			? OkAt<Arr<Base>, NumThen<T, Nx2<I>, "]">>
			: Ok<Arr<Base>, Nx<I>>
		: ArrayBounds<T, I, Base>;
type ArrayBounds<T extends Toks, I extends number, Base extends string> =
	T[I] extends OpTok<"[">
		? (
				T[Nx<I>] extends OpTok<"]">
					? Nx2<I>
					: NumThen<T, Nx<I>, "]">
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
	? T[Nx<I>] extends OpTok<C>
		? Nx2<I>
		: SyntaxErrorAt<T, Nx<I>>
	: SyntaxErrorAt<T, I>;
type Arr<Base extends string> = Base extends `${string}[]` ? Base : `${Base}[]`;
