interface Succ {
	"0": "1";
	"1": "2";
	"2": "3";
	"3": "4";
	"4": "5";
	"5": "6";
	"6": "7";
	"7": "8";
	"8": "9";
}
type Inc<S extends string> = S extends `${infer H}9`
	? `${H extends "" ? "1" : Inc<H>}0`
	: IncLast<S>;
type IncLast<
	S extends string,
	Prefix extends string = "",
> = S extends keyof Succ
	? `${Prefix}${Succ[S]}`
	: S extends `${infer H}${infer R}`
		? IncLast<R, `${Prefix}${H}`>
		: never;

type Untracked<S extends string> =
	S extends `${infer A}${infer B}${infer C}${infer D}${infer E}`
		? E extends ""
			? A extends "5" | "6" | "7" | "8" | "9"
				? true
				: A extends "4"
					? B extends "0"
						? C extends "9"
							? D extends "6" | "7" | "8" | "9"
								? true
								: false
							: false
						: true
					: false
			: true
		: false;
/** `I + 1` for indexes below 4096, `number` otherwise. */
export type Next<I extends number> = number extends I
	? number
	: Untracked<`${I}`> extends true
		? number
		: Inc<`${I}`> extends `${infer N extends number}`
			? N
			: never;
