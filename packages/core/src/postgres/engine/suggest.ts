import type { Best, IsRelation, RelCols } from "../../engine/suggest.js";
import type { Toks } from "../../engine/tokens.js";
import type { Nx } from "./parser/util.js";
import type { FunctionCatalog } from "./typer/catalog.js";

export type WithHint<
	M extends string,
	T extends Toks,
	DB,
> = M extends `column "${infer Name}" of relation "${infer Rel}" does not exist`
	? Hinted<M, Best<Name, ColumnsOf<DB, Rel>>, "column">
	: M extends `column "${infer Name}" does not exist`
		? Hinted<
				M,
				Best<Name, ColumnsOf<DB, MentionedRels<T, DB, 0, never>>>,
				"column"
			>
		: M extends `column ${string}.${infer Name} does not exist`
			? Hinted<
					M,
					Best<Name, ColumnsOf<DB, MentionedRels<T, DB, 0, never>>>,
					"column"
				>
			: M extends `relation "${infer Name}" does not exist`
				? Hinted<M, Best<Name, RelNames<DB>>, "relation">
				: M extends `function ${infer Name}(${infer Args}) does not exist. Declare it ${infer Rest}`
					? Best<Name, SameStart<Name, FnNames<DB>>> extends infer S extends
							string
						? `function ${Name}(${Args}) does not exist. Perhaps you meant the function "${S}"? Otherwise declare it ${Rest}`
						: M
					: M;

type FnNames<DB> =
	| (keyof FunctionCatalog & string)
	| (DB extends { readonly $functions: infer F } ? keyof F & string : never);
type SameStart<Name extends string, Cands> = Name extends `${infer C}${string}`
	? Extract<Cands, `${C}${string}`>
	: never;

type Hinted<M extends string, S, What extends string> = S extends string
	? `${M}. Perhaps you meant the ${What} "${S}"?`
	: M;

type MentionedRels<T extends Toks, DB, I extends number, Acc> = T[I] extends {
	readonly k: string;
}
	? MentionedRels<T, DB, Nx<Nx<I>>, Acc | RelAt<T, Nx<I>, DB> | RelAt<T, I, DB>>
	: Acc;
type RelAt<T extends Toks, I extends number, DB> = T[I] extends {
	readonly k: "w" | "id";
	readonly v: infer V;
}
	? V extends RelNames<DB>
		? V
		: never
	: never;

type RelNames<DB> = {
	[K in keyof DB & string]: K extends "$types" | "$functions"
		? never
		: IsRelation<DB[K]> extends true
			? K
			: NsRelNames<DB[K]>;
}[keyof DB & string];
type NsRelNames<NS> = {
	[K in keyof NS & string]: IsRelation<NS[K]> extends true ? K : never;
}[keyof NS & string];

type ColumnsOf<DB, Rels> = {
	[K in keyof DB & string]: K extends Rels
		? IsRelation<DB[K]> extends true
			? RelCols<DB[K]>
			: never
		: IsRelation<DB[K]> extends true
			? never
			: {
					[R in keyof DB[K] & string]: R extends Rels
						? RelCols<DB[K][R]>
						: never;
				}[keyof DB[K] & string];
}[keyof DB & string];

export type { IsRelation, RelCols };
