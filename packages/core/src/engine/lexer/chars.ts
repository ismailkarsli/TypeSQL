/** Character classes used by the lexer. Kept small: each union member costs. */
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
export type Lower =
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
/**
 * Every ASCII character that can never be part of an identifier. Every other character is an
 * identifier character: an ASCII letter, digit, `_` or `$`, or any non-ASCII character (`café`,
 * `naïve`), as Postgres reads them. Non-ASCII letters are not case-folded (Postgres folds only
 * ASCII letters in UTF-8 databases).
 */
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
