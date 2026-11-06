export type Ws = " " | "\n" | "\t" | "\r" | "\f" | "\v";
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type HexDigit =
	| Digit
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F";
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
export type Upper = Uppercase<Lower>;
export type IdStart = Lower | Upper | "_";
export type NonIdAscii =
	| Ws
	| '"'
	| "'"
	| "`"
	| "\\"
	| "{"
	| "}"
	| "("
	| ")"
	| ","
	| ";"
	| "."
	| "["
	| "]"
	| "+"
	| "-"
	| "*"
	| "/"
	| "%"
	| "^"
	| "<"
	| ">"
	| "="
	| "~"
	| "!"
	| "@"
	| "#"
	| "&"
	| "|"
	| "?"
	| ":";

export type TakeDigits<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends Digit}${infer R}`
	? TakeDigits<R, `${Acc}${C}`>
	: [Acc, S];

/** The identifier characters at the start of `R`. */
export type IdRun<
	R extends string,
	Acc extends string = "",
> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii
		? Acc
		: IdRun<R1, `${Acc}${C}`>
	: Acc;

export type TrimEnd<S extends string> = S extends `${infer R}${Ws}`
	? TrimEnd<R>
	: S;
