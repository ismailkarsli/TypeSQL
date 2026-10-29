import type { Nx } from "../../engine/parse.js";
import type { Best, IsRelation, RelCols } from "../../engine/suggest.js";
import type { Toks } from "../../engine/tokens.js";
import type { SqlError } from "../../errors.js";
import type { FunctionCatalog, Functions } from "./typer/functions.js";

export type Reposition<E, T extends Toks, DB = never> =
	E extends SqlError<infer M, infer At>
		? At extends null
			? SqlError<WithHint<M, T, DB>, Locate<M, T>>
			: SqlError<M, At>
		: E;

type WithHint<M extends string, T extends Toks, DB> = M extends
	| `no such column: ${infer Name}`
	| `table ${string} has no column named ${infer Name}`
	? Name extends `${string} - should this be${string}`
		? M
		: Hinted<
				M,
				Best<
					LastPart<Lowercase<Name>>,
					ColumnsOf<DB, Mentioned<T, DB, 0, never>>,
					true
				>,
				"column"
			>
	: M extends `no such table: ${infer Name}`
		? Hinted<M, Best<LastPart<Lowercase<Name>>, RelNames<DB>, true>, "table">
		: M extends `no such function: ${infer Name}`
			? Hinted<M, Best<Lowercase<Name>, FnNames<DB>, true>, "function">
			: M;

type Hinted<M extends string, S, What extends string> = S extends string
	? `${M}. Perhaps you meant the ${What} "${S}"?`
	: M;

type RelNames<DB> = {
	[K in keyof DB & string]: K extends `$${string}`
		? never
		: IsRelation<DB[K]> extends true
			? K
			: never;
}[keyof DB & string];

type Mentioned<T extends Toks, DB, I extends number, Acc> = T[I] extends {
	readonly k: string;
}
	? Mentioned<T, DB, Nx<I>, Acc | RelAt<T[I], DB>>
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

type FnNames<DB> =
	| (keyof Functions & string)
	| (keyof FunctionCatalog & string)
	| (DB extends { readonly $functions: infer F } ? keyof F & string : never);

export type HintIndex<DB> =
	| {
			[K in RelNames<DB>]: K | `${K}.${RelCols<DB[K]>}`;
	  }[RelNames<DB>]
	| (DB extends { readonly $functions: infer F } ? keyof F & string : never);

type Locate<M extends string, T extends Toks> = M extends
	| `no such column: ${infer Name}`
	| `ambiguous column name: ${infer Name}`
	? FindName<T, LastPart<Unhint<Name>>, 0>
	: M extends
				| `no such table: ${infer Name}`
				| `no such function: ${infer Name}`
				| `cannot modify ${infer Name} because it is a view`
				| `table ${infer Name} has no column named ${string}`
				| `no such collation sequence: ${infer Name}`
		? FindName<T, LastPart<Lowercase<Name>>, 0>
		: M extends
					| `wrong number of arguments to function ${infer Name}()`
					| `misuse of aggregate function ${infer Name}()`
					| `misuse of window function ${infer Name}()`
					| `${infer Name}() may not be used as a window function`
			? FindName<T, Lowercase<Name>, 0>
			: M extends `${string}ORDER BY${string}`
				? FindName<T, "order", 0>
				: M extends `${string}GROUP BY${string}`
					? FindName<T, "group", 0>
					: M extends
								| `${string} values for ${string}`
								| `table ${string} has ${string} columns but ${string}`
						? FindName<T, "values", 0>
						: M extends `${string}RETURNING${string}`
							? FindName<T, "returning", 0>
							: 0;

type Unhint<N extends string> = N extends `"${infer X}" - ${string}`
	? Lowercase<X>
	: Lowercase<N>;
type LastPart<N extends string> = N extends `${string}.${infer R}`
	? LastPart<R>
	: N;

type FindName<
	T extends Toks,
	Name extends string,
	I extends number,
> = T[I] extends {
	readonly k: string;
}
	? T[I] extends { readonly k: "w" | "id"; readonly v: Name }
		? I
		: FindName<T, Name, Nx<I>>
	: 0;
