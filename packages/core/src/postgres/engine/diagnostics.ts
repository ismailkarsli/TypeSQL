import type { IdTok, Toks, WordTok } from "../../engine/tokens.js";
import type { SqlError } from "../../errors.js";
import type { IntoName } from "./parser/select.js";
import type { Nx } from "./parser/util.js";
import type { WithHint } from "./suggest.js";
import type { IntLitValue } from "./typer/operators.js";

export type Reposition<E, T extends Toks, DB = never> =
	E extends SqlError<infer M, infer At>
		? At extends null
			? SqlError<WithHint<M, T, DB>, LocateIdent<M, T>>
			: SqlError<M, At>
		: E;

type LocateIdent<
	M extends string,
	T extends Toks,
> = M extends `function ${infer Name}(${string}`
	? FindTokOr<T, Name, 0>
	: M extends
				| `${infer Name}(*) ${string}`
				| `window function ${infer Name} requires ${string}`
				| `WITHIN GROUP is required for ordered-set aggregate ${infer Name}`
				| `${string} specified, but ${infer Name} is not ${string}`
		? FindTokOr<T, Name, 0>
		: M extends `column ${string}.${infer Name} ${string}`
			? FindTokOr<T, Name, LocateQuoted<M, T>>
			: M extends "DEFAULT is not allowed in this context"
				? FindKwOr<T, "default", 0>
				: M extends "SELECT ... INTO is not allowed here"
					? FindSelectInto<T, 0, null>
					: M extends `${infer Cl} ${string} position ${infer N} is not in select list`
						? FindNumFrom<
								T,
								FindKwOr<T, Lowercase<Cl>, 0>,
								N extends `-${infer D}` ? D : N,
								null
							>
						: M extends `each ${infer Op} query ${string}`
							? FindKwOr<T, Lowercase<Op>, 0>
							: M extends `${infer Op} types ${string} cannot be matched`
								? FindKwOr<T, Lowercase<Op>, 0>
								: LocateQuoted<M, T>;

type LocateQuoted<
	M extends string,
	T extends Toks,
> = M extends `${string}"${infer Name}"${infer Rest}`
	? FindTokOr<
			T,
			Name,
			Name extends `${infer First}.${string}`
				? FindTokOr<T, First, LocateQuoted<Rest, T>>
				: LocateQuoted<Rest, T>
		>
	: 0;

type FindTokOr<
	T extends Toks,
	Name extends string,
	Else extends number,
> = FindOr<T, WordTok<Name> | IdTok<Name>, Else>;

type FindKwOr<T extends Toks, Kw extends string, Else extends number> = FindOr<
	T,
	WordTok<Kw>,
	Else
>;

type FindOr<T extends Toks, P, Else extends number> =
	FindTok<T, P, 0> extends infer I extends number
		? I extends -1
			? Else
			: I
		: Else;

type FindTok<T extends Toks, P, I extends number> = T[I] extends {
	readonly k: string;
}
	? T[I] extends P
		? I
		: T[Nx<I>] extends P
			? Nx<I>
			: T[Nx<Nx<I>>] extends P
				? Nx<Nx<I>>
				: T[Nx<Nx<Nx<I>>>] extends P
					? Nx<Nx<Nx<I>>>
					: FindTok<T, P, Nx<Nx<Nx<Nx<I>>>>>
	: -1;

type FindSelectInto<T extends Toks, I extends number, Prev> =
	T[I] extends WordTok<"into">
		? Prev extends WordTok<"insert" | "merge">
			? FindSelectInto<T, Nx<I>, T[I]>
			: IntoName<T, I>
		: FindSelectInto<T, Nx<I>, T[I]>;

type FindNumFrom<
	T extends Toks,
	I extends number,
	N extends string,
	Minus extends number | null,
> = T[I] extends {
	readonly k: string;
}
	? T[I] extends { readonly k: "n"; readonly v: infer V extends string }
		? IntLitValue<V> extends N
			? Minus extends number
				? Minus
				: I
			: FindNumFrom<T, Nx<I>, N, null>
		: T[I] extends { readonly k: "o"; readonly v: "-" | "(" }
			? FindNumFrom<
					T,
					Nx<I>,
					N,
					Minus extends number
						? Minus
						: T[I] extends { readonly v: "-" }
							? I
							: null
				>
			: FindNumFrom<T, Nx<I>, N, null>
	: 0;
