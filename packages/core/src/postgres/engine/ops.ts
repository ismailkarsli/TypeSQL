// PostgreSQL's operator groups, shared by the parser (precedence), the typer
// (result types, ANY/ALL, row comparison) and parameter inference.

/** Comparison operators, one precedence level in the grammar; `!=` is `<>`. */
export type CompareOp = "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=";
/** Regular expression and LIKE operators (`~~` is LIKE). */
export type MatchOp = "~" | "~*" | "!~" | "!~*" | "~~" | "~~*" | "!~~" | "!~~*";
export type ArithOp = "+" | "-" | "*" | "/" | "%";
/** Operators whose result is never boolean, which ANY/ALL rejects. */
export type NonBoolOp = ArithOp | "^" | "||";
/** JSON operators returning a JSON value or its text. */
export type JsonGetOp = "->" | "#>";
export type JsonTextOp = "->>" | "#>>";
