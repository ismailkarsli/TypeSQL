import type { ColInfo, Info } from "../../../engine/types.js";
import type { LitCommon } from "../json.js";
import type { BaseOf, ShapedCommon } from "../shape.js";

export type IntT = "int2" | "int4" | "int8";
export type FloatT = "float4" | "float8";
export type NumT = IntT | FloatT | "numeric";
export type StrT = "text" | "varchar" | "bpchar" | "char" | "name" | "citext";
export type JsonT = "json" | "jsonb";
export type TsT = "timestamp" | "timestamptz";
export type TimeT = "time" | "timetz";
export type DateTimeT = "date" | TimeT | TsT;
export type BitT = "bit" | "varbit";
export type RangeT = `${string}range`;
export type UnknownT = "unknown" | "null";
export type LitT = "lit";
export type LitToText<T extends string> = T extends LitT ? "text" : T;

type Either<L extends boolean, R extends boolean> = L extends true
	? true
	: R extends true
		? true
		: false;

export type NumPromote<L extends string, R extends string> = "float8" extends
	| L
	| R
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

export type NumCommon<L extends string, R extends string> = "float8" extends
	| L
	| R
	? "float8"
	: "float4" extends L | R
		? "float4"
		: "numeric" extends L | R
			? "numeric"
			: "int8" extends L | R
				? "int8"
				: "int4";

type Norm<A extends string> = A extends "null" | LitT ? "unknown" : A;

export type BinOpType<
	Op extends string,
	L extends ColInfo,
	R extends ColInfo,
> = Info<
	BinOpResult<Op, Norm<L["type"]>, Norm<R["type"]>>,
	BinOpNullable<Op, L, R>
>;

type BinOpNullable<
	Op extends string,
	L extends ColInfo,
	R extends ColInfo,
> = Op extends "->" | "->>" | "#>" | "#>>"
	? true
	: Op extends "@@"
		? L["type"] extends "jsonb"
			? true
			: Either<L["nullable"], R["nullable"]>
		: Either<L["nullable"], R["nullable"]>;

type BinOpResult<
	Op extends string,
	L extends string,
	R extends string,
> = Op extends "=" | "<" | ">" | "<=" | ">=" | "<>" | "!="
	? "bool"
	: Op extends "and" | "or"
		? "bool"
		: Op extends "~" | "~*" | "!~" | "!~*" | "~~" | "~~*" | "!~~" | "!~~*"
			? "bool"
			: Op extends "+" | "-" | "*" | "/" | "%"
				? Arith<Op, L, R>
				: Op extends "||"
					? Concat<L, R>
					: Op extends "->" | "#>"
						? L extends JsonT
							? BaseOf<L>
							: "unknown"
						: Op extends "->>" | "#>>"
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

export type CommonLit<A extends string, B extends string> = A extends B
	? ShapedCommon<A, B>
	: A extends UnknownT
		? B
		: B extends UnknownT
			? A
			: A extends LitT
				? LitCommon<A, B>
				: B extends LitT
					? LitCommon<B, A>
					: A extends NumT
						? B extends NumT
							? NumCommon<A, B>
							: "unknown"
						: A extends StrT
							? B extends StrT
								? StrCommon<A, B>
								: "unknown"
							: A extends BitT
								? B extends BitT
									? A
									: "unknown"
								: A extends "timestamptz"
									? B extends TsT | "date"
										? "timestamptz"
										: "unknown"
									: A extends "timestamp"
										? B extends "timestamptz"
											? "timestamptz"
											: B extends "date"
												? "timestamp"
												: "unknown"
										: A extends "date"
											? B extends TsT
												? B
												: "unknown"
											: A extends "time"
												? B extends "timetz"
													? "timetz"
													: "unknown"
												: A extends "timetz"
													? B extends "time"
														? "timetz"
														: "unknown"
													: A extends "cidr"
														? B extends "inet"
															? "inet"
															: "unknown"
														: A extends "inet"
															? B extends "cidr"
																? "inet"
																: "unknown"
															: A extends `${infer AE}[]`
																? B extends `${infer BE}[]`
																	? CommonLit<AE, BE> extends infer E extends
																			string
																		? E extends "unknown"
																			? "unknown"
																			: `${LitToText<E>}[]`
																		: never
																	: "unknown"
																: ShapedCommon<A, B>;

type StrCommon<A extends string, B extends string> = A extends "char"
	? "unknown"
	: B extends "char"
		? "unknown"
		: A extends "citext"
			? B extends "text" | "varchar"
				? B
				: "unknown"
			: B extends "citext"
				? A extends "text" | "varchar"
					? A
					: "unknown"
				: B extends "name"
					? A extends "text"
						? "text"
						: "name"
					: A;

export type CommonType<A extends string, B extends string> = LitToText<
	CommonLit<A extends "text" ? LitT : A, B extends "text" ? LitT : B>
>;

export type NumLitType<V extends string> = V extends `-${infer D}`
	? UnsignedLitType<NoUnderscores<D>, 1>
	: UnsignedLitType<NoUnderscores<V>, 0>;
type NoUnderscores<V extends string> = V extends `${infer A}_${infer B}`
	? NoUnderscores<`${A}${B}`>
	: V;

type UnsignedLitType<D extends string, Sign extends 0 | 1> = D extends
	| `0x${infer H}`
	| `0X${infer H}`
	? IntLitType<Lowercase<H>, IntBounds["hex"][Sign]>
	: D extends `0o${infer O}` | `0O${infer O}`
		? IntLitType<O, IntBounds["oct"][Sign]>
		: D extends `0b${infer B}` | `0B${infer B}`
			? IntLitType<B, IntBounds["bin"][Sign]>
			: D extends
						| `${string}.${string}`
						| `${string}e${string}`
						| `${string}E${string}`
				? "numeric"
				: IntLitType<D, IntBounds["dec"][Sign]>;

type IntBounds = {
	dec: [
		["2147483647", "9223372036854775807"],
		["2147483648", "9223372036854775808"],
	];
	hex: [["7fffffff", "7fffffffffffffff"], ["80000000", "8000000000000000"]];
	oct: [
		["17777777777", "777777777777777777777"],
		["20000000000", "1000000000000000000000"],
	];
	bin: [
		[
			"1111111111111111111111111111111",
			"111111111111111111111111111111111111111111111111111111111111111",
		],
		[
			"10000000000000000000000000000000",
			"1000000000000000000000000000000000000000000000000000000000000000",
		],
	];
};

type IntLitType<D extends string, Max extends [string, string]> =
	ValueCmp<NoZeros<D>, Max[0]> extends infer C4
		? C4 extends "gt"
			? ValueCmp<NoZeros<D>, Max[1]> extends infer C8
				? C8 extends "gt"
					? "numeric"
					: "int8"
				: never
			: "int4"
		: never;
type NoZeros<D extends string> = D extends `0${infer R}` ? NoZeros<R> : D;
type ValueCmp<V extends string, Max extends string> =
	LengthCmp<V, Max> extends infer L
		? L extends "eq"
			? DigitsCmp<V, Max>
			: L
		: never;
type LengthCmp<
	A extends string,
	B extends string,
> = A extends `${string}${infer AR}`
	? B extends `${string}${infer BR}`
		? LengthCmp<AR, BR>
		: "gt"
	: B extends ""
		? "eq"
		: "lt";
type DigitsCmp<A extends string, B extends string> = [A, B] extends [
	`${infer AC}${infer AR}`,
	`${infer BC}${infer BR}`,
]
	? AC extends BC
		? DigitsCmp<AR, BR>
		: DigitRank[BC & keyof DigitRank] extends [
					...DigitRank[AC & keyof DigitRank],
					unknown,
					...unknown[],
				]
			? "lt"
			: "gt"
	: "eq";
type DigitRank = {
	"0": [];
	"1": [0];
	"2": [0, 0];
	"3": [0, 0, 0];
	"4": [0, 0, 0, 0];
	"5": [0, 0, 0, 0, 0];
	"6": [0, 0, 0, 0, 0, 0];
	"7": [0, 0, 0, 0, 0, 0, 0];
	"8": [0, 0, 0, 0, 0, 0, 0, 0];
	"9": [0, 0, 0, 0, 0, 0, 0, 0, 0];
	a: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	c: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	e: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	f: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
};

export type IntLitValue<V extends string> =
	Lowercase<
		NoUnderscores<V>
	> extends `0${infer P extends keyof Radix}${infer Ds}`
		? FromRadix<Ds, Radix[P], keyof DigitRank, "0">
		: FromRadix<Lowercase<NoUnderscores<V>>, Ten, Digit, "0">;
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Ten = DigitRank["a"];
type Radix = {
	x: [...DigitRank["f"], 0];
	o: DigitRank["8"];
	b: DigitRank["2"];
};
type FromRadix<
	Ds extends string,
	R extends unknown[],
	Dg extends keyof DigitRank,
	Rev extends string,
> = Ds extends `${infer C extends Dg}${infer Rest}`
	? FromRadix<Rest, R, Dg, MulAdd<Rev, R, DigitRank[C], "">>
	: Ds extends ""
		? Reverse<Rev, "">
		: null;
type MulAdd<
	Rev extends string,
	R extends unknown[],
	Carry extends unknown[],
	Out extends string,
> = Rev extends `${infer D extends Digit}${infer Rest}`
	? DivMod10<[...Times<DigitRank[D], R, []>, ...Carry], []> extends [
			infer Q extends unknown[],
			infer M extends number,
		]
		? MulAdd<Rest, R, Q, `${Out}${M}`>
		: never
	: Carry extends []
		? Out
		: MulAdd<"0", R, Carry, Out>;
type Times<
	N extends unknown[],
	R extends unknown[],
	Acc extends unknown[],
> = N extends [unknown, ...infer NR] ? Times<NR, R, [...Acc, ...R]> : Acc;
type DivMod10<T extends unknown[], Q extends unknown[]> = T extends [
	...Ten,
	...infer Rest,
]
	? DivMod10<Rest, [...Q, 0]>
	: [Q, T["length"]];
type Reverse<
	S extends string,
	Acc extends string,
> = S extends `${infer C}${infer R}` ? Reverse<R, `${C}${Acc}`> : Acc;
