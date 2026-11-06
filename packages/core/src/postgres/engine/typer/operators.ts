import type { Or } from "../../../engine/object.js";
import type { ColInfo, Info } from "../../../engine/types.js";
import type { SqlError } from "../../../errors.js";
import type {
	BitT,
	FloatT,
	IntT,
	JsonT,
	NumT,
	RangeT,
	StrT,
	TimeT,
	TsT,
	TypeFact,
} from "../../schema/type-facts.js";
import type { LitCommon } from "../json.js";
import type {
	ArithOp,
	CompareOp,
	JsonGetOp,
	JsonTextOp,
	MatchOp,
} from "../ops.js";
import type {
	ArrInfo,
	BaseOf,
	ElemNull,
	LitToText,
	ShapedCommon,
	TypeDisplay,
} from "../shape.js";

type UnknownT = "unknown" | "null";

/** Two types of different categories, which no operator compares. */
export type Unmatchable<A extends string, B extends string> =
	TypeFact<A, "cat"> extends infer CA extends string
		? TypeFact<B, "cat"> extends infer CB extends string
			? CA extends CB
				? false
				: true
			: false
		: false;
type LitT = "lit";

type NumPromote<L extends string, R extends string> = "float8" extends L | R
	? "float8"
	: "float4" extends L | R
		? L extends "float4"
			? R extends "float4"
				? "float4"
				: "float8"
			: "float8"
		: "numeric" extends L | R
			? "numeric"
			: "int8" extends L | R
				? "int8"
				: "int4" extends L | R
					? "int4"
					: "int2";

type Norm<A extends string> = A extends "null" | LitT ? "unknown" : A;

export type BinOpType<
	Op extends string,
	L extends ColInfo,
	R extends ColInfo,
> = Op extends "||"
	? ArrInfo<
			BinOpResult<Op, Norm<L["type"]>, Norm<R["type"]>>,
			BinOpNullable<Op, L, R>,
			ConcatElemNull<L, R>
		>
	: Info<
			BinOpResult<Op, Norm<L["type"]>, Norm<R["type"]>>,
			BinOpNullable<Op, L, R>
		>;
/** `array || x` adds x as an element; `array || array` keeps both arrays' elements. */
type ConcatElemNull<
	L extends ColInfo,
	R extends ColInfo,
> = L["type"] extends `${string}[]`
	? ElemNull<L> extends true
		? true
		: ConcatItemNull<R>
	: R["type"] extends `${string}[]`
		? ElemNull<R> extends true
			? true
			: ConcatItemNull<L>
		: false;
type ConcatItemNull<A extends ColInfo> = A["type"] extends UnknownT | LitT
	? false
	: ElemNull<A>;

type BinOpNullable<
	Op extends string,
	L extends ColInfo,
	R extends ColInfo,
> = Op extends JsonGetOp | JsonTextOp
	? true
	: Op extends "@@"
		? L["type"] extends "jsonb"
			? true
			: Or<L["nullable"], R["nullable"]>
		: Or<L["nullable"], R["nullable"]>;

type BinOpResult<
	Op extends string,
	L extends string,
	R extends string,
> = Op extends CompareOp
	? "bool"
	: Op extends "and" | "or"
		? "bool"
		: Op extends MatchOp
			? "bool"
			: Op extends ArithOp
				? Arith<Op, L, R>
				: Op extends "||"
					? Concat<L, R>
					: Op extends JsonGetOp
						? L extends JsonT
							? BaseOf<L>
							: "unknown"
						: Op extends JsonTextOp
							? "text"
							: Op extends "#-"
								? "jsonb"
								: Op extends
											| "@>"
											| "<@"
											| "?"
											| "?|"
											| "?&"
											| "@?"
											| "@@"
											| "-|-"
											| "~="
									? "bool"
									: Op extends
												| "<<|"
												| "|>>"
												| "&<|"
												| "|&>"
												| "<^"
												| ">^"
												| "&<"
												| "&>"
												| "?#"
												| "?-"
												| "?-|"
												| "?||"
												| "<<="
												| ">>="
										? "bool"
										: Op extends "##"
											? "point"
											: Op extends "&&"
												? TsQueryOr<L, R, "bool">
												: Op extends "<->"
													? TsQueryOr<L, R, "float8">
													: Op extends "^"
														? Pow<L, R>
														: Op extends "&" | "|" | "#"
															? BitOp<L, R>
															: Op extends "<<" | ">>"
																? Shift<L, R>
																: "unknown";

type TsQueryOr<
	L extends string,
	R extends string,
	Else extends string,
> = L extends "tsquery"
	? "tsquery"
	: L extends "unknown"
		? R extends "tsquery"
			? "tsquery"
			: Else
		: Else;

type Pow<L extends string, R extends string> = L | R extends NumT | "unknown"
	? L | R extends IntT | "numeric" | "unknown"
		? "numeric" extends L | R
			? "numeric"
			: "float8"
		: "float8"
	: "unknown";

type BitOp<L extends string, R extends string> = L extends IntT
	? R extends IntT
		? NumPromote<L, R>
		: R extends "unknown"
			? L
			: "unknown"
	: L extends BitT
		? "bit"
		: L extends "inet" | "cidr"
			? "inet"
			: L extends "unknown"
				? R extends IntT
					? R
					: R extends BitT
						? "bit"
						: R extends "inet" | "cidr"
							? "inet"
							: "unknown"
				: "unknown";

type Shift<L extends string, R extends string> = L extends IntT
	? L
	: L extends BitT
		? "bit"
		: L extends "unknown"
			? R extends "int4"
				? "int4"
				: "bool"
			: "bool";

type Arith<Op extends string, L extends string, R extends string> =
	ArithOf<Op, L, R> extends infer T extends string
		? T extends "unknown"
			? L extends "time"
				? ArithOf<Op, "interval", R>
				: R extends "time"
					? ArithOf<Op, L, "interval">
					: T
			: T
		: never;
type ArithOf<
	Op extends string,
	L extends string,
	R extends string,
> = L extends "unknown"
	? ArithUnknown<Op, R, "l">
	: R extends "unknown"
		? ArithUnknown<Op, L, "r">
		: L extends NumT
			? R extends NumT
				? Op extends "%"
					? L | R extends IntT | "numeric"
						? NumPromote<L, R>
						: "unknown"
					: NumPromote<L, R>
				: R extends "interval"
					? Op extends "*"
						? "interval"
						: "unknown"
					: R extends "date"
						? Op extends "+"
							? L extends "int2" | "int4"
								? "date"
								: "unknown"
							: "unknown"
						: R extends "money"
							? Op extends "*"
								? "money"
								: "unknown"
							: R extends "inet" | "cidr"
								? Op extends "+"
									? L extends IntT
										? "inet"
										: "unknown"
									: "unknown"
								: "unknown"
			: L extends "date"
				? R extends "int2" | "int4"
					? Op extends "+" | "-"
						? "date"
						: "unknown"
					: R extends "date"
						? Op extends "-"
							? "int4"
							: "unknown"
						: R extends "interval"
							? Op extends "+" | "-"
								? "timestamp"
								: "unknown"
							: R extends "timetz"
								? Op extends "+"
									? "timestamptz"
									: "unknown"
								: R extends TsT
									? Op extends "-"
										? "interval"
										: "unknown"
									: "unknown"
				: L extends TsT
					? R extends TsT | "date"
						? Op extends "-"
							? "interval"
							: "unknown"
						: R extends "interval"
							? Op extends "+" | "-"
								? L
								: "unknown"
							: "unknown"
					: L extends "time"
						? R extends "interval"
							? Op extends "+" | "-"
								? "time"
								: "unknown"
							: R extends "time"
								? Op extends "-"
									? "interval"
									: "unknown"
								: "unknown"
						: L extends "timetz"
							? R extends "interval"
								? Op extends "+" | "-"
									? "timetz"
									: "unknown"
								: R extends "date"
									? Op extends "+"
										? "timestamptz"
										: "unknown"
									: "unknown"
							: L extends "interval"
								? R extends "interval"
									? Op extends "+" | "-"
										? "interval"
										: "unknown"
									: R extends NumT
										? Op extends "*" | "/"
											? "interval"
											: "unknown"
										: R extends "date"
											? Op extends "+"
												? "timestamp"
												: "unknown"
											: R extends TsT | TimeT
												? Op extends "+"
													? R
													: "unknown"
												: "unknown"
								: L extends "money"
									? R extends "money"
										? Op extends "/"
											? "float8"
											: Op extends "+" | "-"
												? "money"
												: "unknown"
										: R extends NumT
											? Op extends "*" | "/"
												? "money"
												: "unknown"
											: "unknown"
									: L extends "inet" | "cidr"
										? R extends IntT
											? Op extends "+" | "-"
												? "inet"
												: "unknown"
											: R extends "inet" | "cidr"
												? Op extends "-"
													? "int8"
													: "unknown"
												: "unknown"
										: L extends "jsonb"
											? Op extends "-"
												? R extends StrT | "int2" | "int4" | "text[]"
													? "jsonb"
													: "unknown"
												: "unknown"
											: L extends RangeT
												? R extends L
													? Op extends "+" | "-" | "*"
														? L
														: "unknown"
													: "unknown"
												: L extends "point"
													? R extends "point"
														? Op extends "%"
															? "unknown"
															: "point"
														: "unknown"
													: "unknown";

type ArithUnknown<
	Op extends string,
	K extends string,
	Side extends "l" | "r",
> = K extends NumT
	? Op extends "%"
		? K extends FloatT
			? "unknown"
			: K
		: K
	: K extends "date"
		? Op extends "-"
			? "int4"
			: "unknown"
		: K extends TsT | "time"
			? Op extends "-"
				? "interval"
				: Op extends "+"
					? K
					: "unknown"
			: K extends "timetz"
				? Side extends "r"
					? Op extends "-"
						? "timetz"
						: "unknown"
					: "unknown"
				: K extends "interval"
					? Op extends "%"
						? "unknown"
						: Op extends "/"
							? Side extends "r"
								? "interval"
								: "unknown"
							: "interval"
					: K extends "money"
						? Op extends "/"
							? "float8"
							: Op extends "%"
								? "unknown"
								: "money"
						: K extends "jsonb"
							? Side extends "r"
								? Op extends "-"
									? "jsonb"
									: "unknown"
								: "unknown"
							: K extends RangeT
								? Op extends "+" | "-" | "*"
									? K
									: "unknown"
								: K extends "point"
									? Op extends "%"
										? "unknown"
										: "point"
									: K extends "inet" | "cidr"
										? Op extends "-"
											? "int8"
											: Op extends "+"
												? "inet"
												: "unknown"
										: "unknown";

type Concat<L extends string, R extends string> = L extends `${string}[]`
	? CommonLit<L, R extends `${string}[]` ? R : `${R}[]`>
	: R extends `${string}[]`
		? CommonLit<`${L}[]`, R>
		: SelfConcat<ConcatBase<L>, ConcatBase<R>>;
type ConcatBase<T extends string> = T extends BitT ? "varbit" : BaseOf<T>;
type SelfConcat<L extends string, R extends string> = L extends
	| "jsonb"
	| "bytea"
	| "tsvector"
	| "tsquery"
	| "varbit"
	? R extends L | "unknown"
		? L
		: TextConcat<L, R>
	: R extends "jsonb" | "bytea" | "tsvector" | "tsquery" | "varbit"
		? L extends "unknown"
			? R
			: TextConcat<L, R>
		: TextConcat<L, R>;
type TextConcat<L extends string, R extends string> = L extends StrT | "unknown"
	? "text"
	: R extends StrT | "unknown"
		? "text"
		: "unknown";

export type UnOpType<Op extends string, E extends ColInfo> = Op extends "not"
	? Info<"bool", E["nullable"]>
	: Op extends "-"
		? Info<
				E["type"] extends NumT | "interval"
					? E["type"]
					: E["type"] extends "time"
						? "interval"
						: "unknown",
				E["nullable"]
			>
		: Op extends "+" | "@"
			? Info<
					E["type"] extends NumT
						? E["type"]
						: E["type"] extends UnknownT
							? "float8"
							: "unknown",
					E["nullable"]
				>
			: Op extends "~"
				? Info<
						E["type"] extends IntT
							? E["type"]
							: E["type"] extends BitT
								? "bit"
								: E["type"] extends "inet" | "cidr"
									? "inet"
									: "unknown",
						E["nullable"]
					>
				: Op extends "!!"
					? Info<
							E["type"] extends "tsquery" | UnknownT ? "tsquery" : "unknown",
							E["nullable"]
						>
					: Op extends "|/" | "||/" | "@-@"
						? Info<"float8", E["nullable"]>
						: Op extends "@@"
							? Info<
									E["type"] extends "unknown" ? "unknown" : "point",
									E["nullable"]
								>
							: Op extends "#"
								? Info<
										E["type"] extends "path" | "polygon" ? "int4" : "unknown",
										E["nullable"]
									>
								: Op extends "?-" | "?|"
									? Info<"bool", E["nullable"]>
									: Info<"unknown", true>;

/**
 * PostgreSQL's select_common_type for two types: a literal or NULL takes the
 * other's type; otherwise the first type is kept when the second converts to
 * it, and the second taken when only the first converts (TypeFact "from").
 */
type CommonLit<A extends string, B extends string> = A extends B
	? ShapedCommon<A, B>
	: A extends UnknownT
		? B
		: B extends UnknownT
			? A
			: A extends LitT
				? LitCommon<A, B>
				: B extends LitT
					? LitCommon<B, A>
					: B extends TypeFact<A, "from", never>
						? A
						: A extends TypeFact<B, "from", never>
							? B
							: A extends `${infer AE}[]`
								? B extends `${infer BE}[]`
									? CommonLit<AE, BE> extends infer E extends string
										? E extends "unknown"
											? "unknown"
											: `${LitToText<E>}[]`
										: never
									: "unknown"
								: ShapedCommon<A, B>;

/**
 * PostgreSQL's select_common_type for CASE, COALESCE, GREATEST, LEAST, ARRAY[],
 * VALUES, UNION/INTERSECT/EXCEPT and CYCLE: the type both values convert to,
 * or `Unmatched` when there is none.
 */
export type SelectCommon<A extends string, B extends string> =
	CommonLit<A, B> extends infer T extends string
		? T extends "unknown"
			? A extends UnknownT
				? T
				: B extends UnknownT
					? T
					: Unmatched<A, B>
			: T
		: never;
type Unmatched<A extends string, B extends string> = {
	readonly unmatched: readonly [A, B];
};
/** PostgreSQL's error for `Unmatched` types in a `What` construct. */
export type UnmatchedErr<What extends string, U> =
	U extends Unmatched<infer A, infer B>
		? SqlError<
				`${What} types ${TypeDisplay<A>} and ${TypeDisplay<B>} cannot be matched`,
				null
			>
		: never;

export type CommonType<A extends string, B extends string> = LitToText<
	CommonLit<A extends "text" ? LitT : A, B extends "text" ? LitT : B>
>;
