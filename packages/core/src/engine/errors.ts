/**
 * Error representation shared by every engine stage.
 *
 * Every stage returns either its success value or an `SqlError`. Errors propagate
 * unchanged, so the first failure reaches the user with the original message.
 *
 * Internally `At` is the number of *remaining* tokens when the error was raised
 * (cheap: `Rest["length"]`). The public boundary (`Validate`) converts it to a
 * character offset by re-lexing with positions, so the cost is only paid on the
 * error path.
 */
declare const ERR: unique symbol;
export type ERR = typeof ERR;

export type SqlError<Message extends string, At = unknown> = {
	readonly [ERR]: Message;
	/**
	 * Token index of the error. (Not named `at`: `SqlError & Q` must stay a non-`never`
	 * intersection with the query string, and `String.prototype.at` would conflict.)
	 */
	readonly position: At;
};

/** Any error, regardless of message/position. */
export type AnyErr = { readonly [ERR]: string };

export type IsErr<T> = T extends AnyErr ? true : false;

/** Message of an error (or never). */
export type ErrMsg<T> = T extends SqlError<infer M, any> ? M : never;
export type ErrAt<T> = T extends SqlError<any, infer A> ? A : never;

/** Re-tag an error with a new position. */
export type Reposition<E, At> =
	E extends SqlError<infer M, any> ? SqlError<M, At> : E;

/** Error raised with the remaining token count as position. */
export type ErrAtRest<
	Message extends string,
	Rest extends readonly unknown[],
> = SqlError<Message, Rest["length"]>;
