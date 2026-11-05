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

type WithHint<
	M extends string,
	T extends Toks,
	DB,
> = M extends `Unknown column '${infer Name}'${string}`
	? Hinted<
			M,
			Best<
				LastPart<Lowercase<Name>>,
				ColumnsOf<DB, Mentioned<T, DB, 0, never>>,
				true
			>,
			"column"
		>
	: M extends `Table '${infer Name}' doesn't exist`
		? Hinted<M, Best<LastPart<Lowercase<Name>>, RelNames<DB>, true>, "table">
		: M extends `FUNCTION ${infer Name} does not exist`
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

type Locate<M extends string, T extends Toks> = M extends
	| `Unknown column '${infer Name}'${string}`
	| `Column '${infer Name}'${string} ambiguous`
	| `Field '${infer Name}' doesn't have a default value`
	| `The value specified for generated column '${infer Name}'${string}`
	? FindName<T, LastPart<Lowercase<Name>>, 0>
	: M extends
				| `Table '${infer Name}' ${string}`
				| `Unknown table '${infer Name}'${string}`
				| `Not unique table/alias: '${infer Name}'`
		? FindName<T, LastPart<Lowercase<Name>>, 0>
		: M extends
					| `FUNCTION ${infer Name} does not exist`
					| `Incorrect parameter count in the call to native function '${infer Name}'`
			? FindName<T, LastPart<Lowercase<Name>>, 0>
			: M extends `Duplicate column name '${infer Name}'`
				? FindName<T, Lowercase<Name>, 0>
				: M extends `${string}RETURNING${string}`
					? FindName<T, "returning", 0>
					: M extends `${string}value count${string}`
						? FindName<T, "values", 0>
						: M extends `${string}LIMIT${string}`
							? FindName<T, "limit", 0>
							: M extends
										| `${string}group function${string}`
										| `${string}only_full_group_by`
								? 0
								: 0;

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
