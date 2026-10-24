type Lower =
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "q"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z";
type Upper = Uppercase<Lower>;
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type Cls<C extends string> = C extends Lower
	? "l"
	: C extends Digit
		? "d"
		: C extends Upper
			? "u"
			: "o";

/** A new word starts at `C` (class `K`) after a char of class `P`, `R` being the rest of the input. */
type Starts<P, K, R extends string> = K extends "u"
	? P extends "l" | "d"
		? true
		: P extends "u"
			? R extends `${Lower}${string}`
				? true
				: false
			: false
	: K extends "d"
		? P extends "u"
			? true
			: false
		: false;

type Push<A extends string[], W extends string> = W extends "" ? A : [...A, W];

/**
 * Words of an identifier, as Drizzle's `casing` splits them
 * (`/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g`): `"userID2fa"` → `["user", "ID", "2fa"]`.
 */
export type Words<
	S extends string,
	W extends string = "",
	Acc extends string[] = [],
	P = "o",
> = S extends `${infer C}${infer R}`
	? Cls<C> extends "o"
		? Words<R, "", Push<Acc, W>, "o">
		: Starts<P, Cls<C>, R> extends true
			? Words<R, C, Push<Acc, W>, Cls<C>>
			: Words<R, `${W}${C}`, Acc, Cls<C>>
	: Push<Acc, W>;

type Snake<Ws extends string[], Acc extends string = ""> = Ws extends [
	infer W extends string,
	...infer R extends string[],
]
	? Snake<R, Acc extends "" ? Lowercase<W> : `${Acc}_${Lowercase<W>}`>
	: Acc;
type Camel<Ws extends string[], Acc extends string = ""> = Ws extends [
	infer W extends string,
	...infer R extends string[],
]
	? Camel<R, Acc extends "" ? Lowercase<W> : `${Acc}${Capitalize<W>}`>
	: Acc;

/** Drizzle's `toSnakeCase`: `"displayName"` → `"display_name"`. */
export type ToSnakeCase<S extends string> = Snake<Words<S>>;
/** Drizzle's `toCamelCase`: `"display_name"` → `"displayName"`. */
export type ToCamelCase<S extends string> = Camel<Words<S>>;
