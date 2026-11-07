import type { SqlError } from "../errors.js";

/** A token of any dialect's lexer: its kind and value; dialects add fields. */
export type Tok = { readonly k: string; readonly v: unknown };
export type Toks = readonly Tok[];

/** A parse result: the node and the index of the next token. */
export type Ok<N, J extends number> = readonly [N, J];

export type AtEnd<T extends Toks, I extends number> = T[I] extends Tok
	? false
	: true;

/**
 * The most tokens a statement or script may have. `Next` counts exactly up to this index;
 * past it a position is `number`, a token there is the union of every token, and the parser
 * would report a syntax error at a valid token.
 */
type MaxTokens = 4096;

/** Whether `T` has more tokens than the parser can track. */
export type TooManyTokens<T extends Toks> = T[MaxTokens] extends Tok
	? true
	: false;

/**
 * The error for a text that {@link TooManyTokens}, at the first token past the limit. The
 * conditional makes the compiler print the `SqlError` rather than this alias of the tokens.
 */
export type TooLong<T extends Toks> = T["length"] extends infer N extends number
	? SqlError<
			`the SQL text has ${N} tokens, more than the ${MaxTokens} TypeSQL can check: split it into several statements or .ddl() calls, or use sql.as<Row>() for a query`,
			MaxTokens
		>
	: never;
