import type { AtEnd, Nx, Ok } from "../../../engine/parse.js";
import type { Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { NameOf, RawOf } from "../tokens.js";
import type { NotBareAlias, NotTableAlias, Reserved } from "./keywords.js";

export type { AtEnd, Nx, Ok } from "../../../engine/parse.js";

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

type IdentAt<T extends Toks, I extends number, Not> = T[I] extends {
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

export type CloseOk<T extends Toks, I extends number, V> =
	IsOp<T, I, ")"> extends true ? Ok<V, Nx<I>> : SyntaxErr<T, I>;

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
	Expect<T, I, "("> extends infer J extends number
		? IdentListLoop<T, J, []>
		: Expect<T, I, "(">;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly Name[],
> =
	Ident<T, I> extends infer N extends Name
		? T[Nx<I>] extends { readonly k: "o"; readonly v: "," }
			? IdentListLoop<T, Nx<Nx<I>>, [...Acc, N]>
			: CloseOk<T, Nx<I>, [...Acc, N]>
		: SyntaxErr<T, I>;

export type OptCols<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true ? IdentList<T, I> : Ok<null, I>;

export type NamesV<N extends readonly Name[]> = {
	[K in keyof N]: N[K] extends Name ? N[K]["v"] : never;
};

export type TableRefAt<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Nx<I>, "."> extends true
			? Ident<T, Nx<Nx<I>>> extends infer B extends Name
				? Ok<{ schema: A["v"]; name: B["v"] }, Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: Ok<{ schema: null; name: A["v"] }, Nx<I>>
		: SyntaxErr<T, I>;

export type SkipIndexed<T extends Toks, I extends number> =
	IsWord<T, I, "indexed"> extends true
		? IsWord<T, Nx<I>, "by"> extends true
			? Ident<T, Nx<Nx<I>>> extends Name
				? Nx<Nx<Nx<I>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "not"> extends true
			? IsWord<T, Nx<I>, "indexed"> extends true
				? Nx<Nx<I>>
				: SyntaxErr<T, Nx<I>>
			: I;
