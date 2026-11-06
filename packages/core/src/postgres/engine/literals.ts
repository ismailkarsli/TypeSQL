// Numeric literals as PostgreSQL's lexer types them, and their integer values
// (for ORDER BY / GROUP BY positions and error locations).

import type { Digit } from "../../engine/chars.js";

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
	ValueCmp<NoZeros<D>, Max[0]> extends "gt"
		? ValueCmp<NoZeros<D>, Max[1]> extends "gt"
			? "numeric"
			: "int8"
		: "int4";
type NoZeros<D extends string> = D extends `0${infer R}` ? NoZeros<R> : D;
type ValueCmp<V extends string, Max extends string> =
	LengthCmp<V, Max> extends "eq" ? DigitsCmp<V, Max> : LengthCmp<V, Max>;
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
