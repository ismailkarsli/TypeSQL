import type { IsRelation } from "../../schema.js";
import type { TypeAliases } from "./type-facts.js";

export type NormalizeTypeName<S extends string> = S extends `${infer E}[]`
	? `${NormalizeTypeName<E>}[]`
	: S extends keyof TypeAliases
		? TypeAliases[S]
		: S;

/** Type spellings that differ from the canonical name (`integer`, `bool`, …). */
type AliasSpelling = keyof TypeAliases;

type IsAlias<T> = T extends string
	? string extends T
		? false
		: T extends AliasSpelling | `${AliasSpelling}[]` | `${AliasSpelling}[][]`
			? true
			: false
	: false;

type SkippedKey = `$${string}` | "pg_catalog" | "information_schema";

type ColsHaveAlias<R> = true extends {
	[C in keyof R]: R[C] extends { readonly type: infer T } ? IsAlias<T> : false;
}[keyof R]
	? true
	: false;

type EntryHasAlias<R> = R extends { readonly $view: infer V }
	? ColsHaveAlias<V>
	: IsRelation<R> extends true
		? ColsHaveAlias<R>
		: true extends { [T in keyof R]: EntryHasAlias<R[T]> }[keyof R]
			? true
			: false;

type NormCol<C> = C extends { readonly type: infer T }
	? IsAlias<T> extends true
		? {
				readonly [P in keyof C]: P extends "type"
					? NormalizeTypeName<T & string>
					: C[P];
			}
		: C
	: C;
type NormCols<R> = { [C in keyof R]: NormCol<R[C]> };
type NormEntry<R> = R extends { readonly $view: infer V }
	? { readonly $view: NormCols<V> }
	: IsRelation<R> extends true
		? NormCols<R>
		: { [T in keyof R]: NormEntry<R[T]> };

/**
 * A hand-written schema may spell column types as in SQL (`Col<"integer">`,
 * `Col<"timestamp with time zone">`). Rewrite them to the canonical names the
 * engine and type maps use; a schema without such spellings is returned as is.
 */
export type NormalizeSchema<DB> = true extends {
	[K in keyof DB]: K extends SkippedKey ? false : EntryHasAlias<DB[K]>;
}[keyof DB]
	? {
			[K in keyof DB]: K extends SkippedKey ? DB[K] : NormEntry<DB[K]>;
		}
	: DB;
