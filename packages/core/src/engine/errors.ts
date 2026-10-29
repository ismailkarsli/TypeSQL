declare const ERR: unique symbol;
export type ERR = typeof ERR;

export type SqlError<Message extends string, At = unknown> = {
	readonly [ERR]: Message;
	readonly position: At;
};

export type AnyErr = { readonly [ERR]: string };

export type IsErr<T> = T extends AnyErr ? true : false;

export type ErrMsg<T> = T extends SqlError<infer M, any> ? M : never;
export type ErrAt<T> = T extends SqlError<any, infer A> ? A : never;
