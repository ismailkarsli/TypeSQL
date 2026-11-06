// Parser leaves shared by the MySQL and SQLite parsers. Identifier rules take
// the dialect's reserved words as `Not`; a syntax error records the token it
// stopped at, and the dialect words the message (see `SyntaxWords`).
import type { SqlError } from "../../errors.js";
import type { TrimEnd } from "../chars.js";
import type { Next } from "../next.js";
import type { Ok, Toks } from "../tokens.js";
import type { SyntaxAt } from "./diagnostics.js";
import type { NameOf, RawOf } from "./lex.js";

export type SyntaxErr<T extends Toks, I extends number> = SqlError<
	"",
	SyntaxAt<I, T[I]>
>;

export type Name = { readonly v: string; readonly n: string };

export type IdentAt<T extends Toks, I extends number, Not> = T[I] extends {
	readonly k: "id";
}
	? Name & { readonly v: T[I]["v" & keyof T[I]]; readonly n: NameOf<T[I]> }
	: T[I] extends { readonly k: "w"; readonly v: infer V }
		? V extends Not
			? null
			: { readonly v: V; readonly n: NameOf<T[I]> }
		: null;

export type AliasAt<T extends Toks, I extends number, Not> = T[I] extends {
	readonly k: "s";
	readonly v: infer V extends string;
}
	? T[I] extends { readonly blob: true }
		? null
		: { readonly v: Lowercase<V>; readonly n: V }
	: IdentAt<T, I, Not>;

export type IsOp<
	T extends Toks,
	I extends number,
	O extends string,
> = T[I] extends { readonly k: "o"; readonly v: O } ? true : false;
export type IsWord<
	T extends Toks,
	I extends number,
	W extends string,
> = T[I] extends { readonly k: "w"; readonly v: W } ? true : false;

export type Expect<
	T extends Toks,
	I extends number,
	O extends string,
> = T[I] extends { readonly k: "o"; readonly v: O } ? Next<I> : SyntaxErr<T, I>;

export type CloseOk<T extends Toks, I extends number, V> =
	IsOp<T, I, ")"> extends true ? Ok<V, Next<I>> : SyntaxErr<T, I>;

/** The statement's own text of tokens `I` to `J - 1`. */
export type SpanText<
	T extends Toks,
	I extends number,
	J extends number,
> = TrimEnd<SpanLoop<T, Next<I>, J, RawOf<T[I]>>>;
type SpanLoop<
	T extends Toks,
	I extends number,
	J extends number,
	Acc extends string,
> = I extends J
	? T[I] extends { readonly g: infer G extends string }
		? `${Acc}${G}`
		: Acc
	: T[I] extends { readonly g: infer G extends string }
		? SpanLoop<T, Next<I>, J, `${Acc}${G}${RawOf<T[I]>}`>
		: Acc;

export type IdentList<T extends Toks, I extends number, Not> =
	Expect<T, I, "("> extends infer J extends number
		? IdentListLoop<T, J, [], Not>
		: Expect<T, I, "(">;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly Name[],
	Not,
> =
	IdentAt<T, I, Not> extends infer N extends Name
		? T[Next<I>] extends { readonly k: "o"; readonly v: "," }
			? IdentListLoop<T, Next<Next<I>>, [...Acc, N], Not>
			: CloseOk<T, Next<I>, [...Acc, N]>
		: SyntaxErr<T, I>;

export type OptCols<T extends Toks, I extends number, Not> =
	IsOp<T, I, "("> extends true ? IdentList<T, I, Not> : Ok<null, I>;

export type NamesV<N extends readonly Name[]> = {
	[K in keyof N]: N[K] extends Name ? N[K]["v"] : never;
};

export type TableRefAt<T extends Toks, I extends number, Not> =
	IdentAt<T, I, Not> extends infer A extends Name
		? IsOp<T, Next<I>, "."> extends true
			? IdentAt<T, Next<Next<I>>, Not> extends infer B extends Name
				? Ok<{ schema: A["v"]; name: B["v"] }, Next<Next<Next<I>>>>
				: SyntaxErr<T, Next<Next<I>>>
			: Ok<{ schema: null; name: A["v"] }, Next<I>>
		: SyntaxErr<T, I>;

export type SkipSemis<T extends Toks, I extends number> =
	IsOp<T, I, ";"> extends true ? SkipSemis<T, Next<I>> : I;

/** `-E`: a negated number literal folds into the literal, so `- -0` is `0`. */
export type Negate<E> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? V extends `-${infer P}`
		? { t: "num"; v: P }
		: { t: "num"; v: `-${V}` }
	: { t: "un"; op: "-"; e: E };

/** `IF NOT EXISTS`: whether it is there, and the index after it. */
export type IfNotExists<T extends Toks, I extends number> =
	IsWord<T, I, "if"> extends true
		? IsWord<T, Next<I>, "not"> extends true
			? IsWord<T, Next<Next<I>>, "exists"> extends true
				? [true, Next<Next<Next<I>>>]
				: SyntaxErr<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: [false, I];
/** `IF EXISTS`: whether it is there, and the index after it. */
export type IfExists<T extends Toks, I extends number> =
	IsWord<T, I, "if"> extends true
		? IsWord<T, Next<I>, "exists"> extends true
			? [true, Next<Next<I>>]
			: SyntaxErr<T, Next<I>>
		: [false, I];

/** Skips the optional `COLUMN` of `ALTER TABLE … ADD | DROP | RENAME COLUMN`. */
export type SkipColumn<T extends Toks, I extends number> =
	IsWord<T, I, "column"> extends true ? Next<I> : I;

/** Skips to the end of a statement the schema ignores. */
export type SkipStatement<
	T extends Toks,
	I extends number,
	What extends string,
> = T[I] extends { readonly k: "o"; readonly v: ";" }
	? Ok<{ t: "noop"; what: What }, I>
	: T[I] extends { readonly k: string }
		? SkipStatement<T, Next<I>, What>
		: Ok<{ t: "noop"; what: What }, I>;
