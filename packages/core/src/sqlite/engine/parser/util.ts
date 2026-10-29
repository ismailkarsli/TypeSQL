import type { AtEnd, Nx, Ok } from "../../../engine/parse.js";
import type { Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { NameOf, RawOf } from "../tokens.js";
import type { NotBareAlias, NotTableAlias, Reserved } from "./keywords.js";

export type { AtEnd, EatOp, EatWord, Nx, Ok } from "../../../engine/parse.js";

export type { Toks };

export type SyntaxErr<T extends Toks, I extends number> = SqlError<
	AtEnd<T, I> extends true
		? "incomplete input"
		: T[I] extends { readonly k: string }
			? `near "${RawOf<T[I]>}": syntax error`
			: "incomplete input",
	I
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

export type Ident<T extends Toks, I extends number> = IdentAt<T, I, Reserved>;

export type AliasAt<T extends Toks, I extends number, Not> = T[I] extends {
	readonly k: "s";
	readonly v: infer V extends string;
}
	? T[I] extends { readonly blob: true }
		? null
		: { readonly v: Lowercase<V>; readonly n: V }
	: IdentAt<T, I, Not>;

export type BareAlias<T extends Toks, I extends number> = AliasAt<
	T,
	I,
	NotBareAlias
>;
export type TableAlias<T extends Toks, I extends number> = AliasAt<
	T,
	I,
	NotTableAlias
>;

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
> = T[I] extends { readonly k: "o"; readonly v: O } ? Nx<I> : SyntaxErr<T, I>;

export type SpanText<T extends Toks, I extends number, J extends number> = Trim<
	SpanLoop<T, Nx<I>, J, RawOf<T[I]>>
>;
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
		? SpanLoop<T, Nx<I>, J, `${Acc}${G}${RawOf<T[I]>}`>
		: Acc;
type Space = " " | "\n" | "\t" | "\r" | "\f" | "\v";
type Trim<S extends string> = S extends `${infer R}${Space}` ? Trim<R> : S;

export type IdentList<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J
		? J extends number
			? IdentListLoop<T, J, []>
			: J
		: never;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly Name[],
> =
	Ident<T, I> extends infer N extends Name
		? T[Nx<I>] extends { readonly k: "o"; readonly v: "," }
			? IdentListLoop<T, Nx<Nx<I>>, [...Acc, N]>
			: Expect<T, Nx<I>, ")"> extends infer J extends number
				? Ok<[...Acc, N], J>
				: SyntaxErr<T, Nx<I>>
		: SyntaxErr<T, I>;
