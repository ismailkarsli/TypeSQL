// How the engine reads and writes the layout of a PostgreSQL schema object:
// relations at the top level (the public schema) or under a namespace key,
// views wrapped in `$view`, and the meta keys below.

import type { MetaKey as SchemaMetaKey, Table, View } from "../../schema.js";

/**
 * Keys that are neither relations nor namespaces: declared enums, declared
 * functions, and the parameters one statement lets be NULL (see infer.ts).
 * MariaDB's flag is no PostgreSQL key.
 */
export type MetaKey = Exclude<SchemaMetaKey, "$flavor">;

/** The enums declared in `$types`, by name. */
export type SchemaTypes<DB> = DB extends { readonly $types: infer R } ? R : {};
/** The functions declared in `$functions`, by name. */
export type SchemaFunctions<DB> = DB extends { readonly $functions: infer F }
	? F
	: {};

export type IsViewVal<X> = X extends { readonly $view: unknown } ? true : false;

export type ColsOf<Rel> = Rel extends { readonly $view: infer C } ? C : Rel;

export type Rewrap<Rel, C> = IsViewVal<Rel> extends true ? AsView<C> : C;

export type AsView<C> = C extends Table ? View<C> : { readonly $view: C };

export type IsNamespace<X> = X extends { readonly $view: unknown }
	? false
	: [keyof X] extends [never]
		? false
		: X[keyof X] extends { readonly type: string }
			? false
			: true;
