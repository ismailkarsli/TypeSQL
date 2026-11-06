// Where MySQL and SQLite errors point. The binder and typer don't know token
// positions, so an error records what to look for (`NameAt`), and a parser
// error the token it stopped at (`SyntaxAt`); `Located` resolves both against
// the statement's tokens once analysis fails.
import type { SqlError } from "../../errors.js";
import type { IsRelation, RelCols } from "../../schema.js";
import type { Next } from "../next.js";
import type { Best } from "../suggest.js";
import type { Toks } from "../tokens.js";
import type { RawOf } from "./lex.js";

export type SyntaxAt<I extends number, Tok> = {
	readonly syntax: I;
	readonly tok: Tok;
};

/** The kind of name a "Perhaps you meant" hint suggests. */
export type HintKind = "column" | "table" | "function" | null;

/**
 * Points at the first word or identifier `Find`, and suggests a `Hint` close
 * to `Name`.
 */
export type NameAt<
	Find extends string,
	Hint extends HintKind = null,
	Name extends string = Find,
> = {
	readonly find: Find;
	readonly hint: Hint;
	readonly name: Name;
};

/** `a.b.c` points at `c`. */
export type LastPart<N extends string> = N extends `${string}.${infer R}`
	? LastPart<R>
	: N;

/** Where an error about the named column, table or function points. */
export type NamedAt<N extends string, Hint extends HintKind = null> = NameAt<
	LastPart<Lowercase<N>>,
	Hint
>;

/** The dialect's syntax error message: `near[0]`, the token's text, `near[1]`, or `end`. */
type SyntaxWords = {
	readonly near: readonly [string, string];
	readonly end: string;
};

type SyntaxMessage<Tok, W extends SyntaxWords> = Tok extends {
	readonly k: string;
}
	? `${W["near"][0]}${RawOf<Tok>}${W["near"][1]}`
	: W["end"];

/** An error with its position in the statement `T`, and a hint for unknown names. */
export type Located<E, T extends Toks, DB, Builtins, W extends SyntaxWords> =
	E extends SqlError<infer M, infer At>
		? At extends number
			? E
			: At extends SyntaxAt<infer I, infer Tok>
				? SqlError<SyntaxMessage<Tok, W>, I>
				: At extends NameAt<infer F, infer H, infer N>
					? SqlError<
							Hinted<M, Suggest<H, N, T, DB, Builtins>, H>,
							FindName<T, F, 0>
						>
					: SqlError<M, 0>
		: E;

/** An error of a DDL script, which has no position unless it is a syntax error. */
export type Unlocated<E, W extends SyntaxWords> =
	E extends SqlError<infer M, infer At>
		? At extends SyntaxAt<infer I, infer Tok>
			? SqlError<SyntaxMessage<Tok, W>, I>
			: At extends NameAt<string, HintKind, string>
				? SqlError<M, null>
				: E
		: E;

type Hinted<M extends string, S, What> = S extends string
	? `${M}. Perhaps you meant the ${What & string} "${S}"?`
	: M;

type Suggest<
	H extends HintKind,
	N extends string,
	T extends Toks,
	DB,
	Builtins,
> = H extends "column"
	? Best<N, ColumnsOf<DB, Mentioned<T, DB, 0, never>>, true>
	: H extends "table"
		? Best<N, RelNames<DB>, true>
		: H extends "function"
			? Best<N, FnNames<DB, Builtins>, true>
			: null;

type RelNames<DB> = {
	[K in keyof DB & string]: K extends `$${string}`
		? never
		: IsRelation<DB[K]> extends true
			? K
			: never;
}[keyof DB & string];

/** The relations the statement names: their columns are the column hints. */
type Mentioned<T extends Toks, DB, I extends number, Acc> = T[I] extends {
	readonly k: string;
}
	? Mentioned<T, DB, Next<I>, Acc | RelAt<T[I], DB>>
	: Acc;
type RelAt<Tok, DB> = Tok extends {
	readonly k: "w" | "id";
	readonly v: infer V;
}
	? {
			[K in RelNames<DB>]: Lowercase<K> extends V ? K : never;
		}[RelNames<DB>]
	: never;

type ColumnsOf<DB, Rels> = {
	[K in RelNames<DB>]: K extends Rels ? RelCols<DB[K]> : never;
}[RelNames<DB>];

type FnNames<DB, Builtins> =
	| (Builtins & string)
	| (DB extends { readonly $functions: infer F } ? keyof F & string : never);

type FindName<
	T extends Toks,
	Name extends string,
	I extends number,
> = T[I] extends {
	readonly k: string;
}
	? T[I] extends { readonly k: "w" | "id"; readonly v: Name }
		? I
		: FindName<T, Name, Next<I>>
	: 0;
