// User-declared functions of the MySQL and SQLite engines: `$functions` in
// the schema and the dialect's augmentable `FunctionCatalog` hold `Sig`s or
// overload lists of them.
import type { Next } from "../next.js";
import type { GE } from "../num.js";
import type { Info } from "../types.js";

/** The largest argument count: no limit. */
export type Many = 1000;

type AnySig = {
	readonly args: readonly string[];
	readonly ret: string;
};

/** The declaration of function `N` (lowercase) in the schema, else in `Catalog`, else `null`. */
export type DeclaredFn<DB, N extends string, Catalog> = (
	DB extends { readonly $functions: infer F }
		? MatchName<F, N>
		: never
) extends infer D
	? [D] extends [never]
		? MatchName<Catalog, N> extends infer C
			? [C] extends [never]
				? null
				: C
			: never
		: D
	: never;
type MatchName<O, N extends string> = {
	[K in keyof O & string]: Lowercase<K> extends N ? O[K] : never;
}[keyof O & string];

/** The signature of an overload list that takes `Argc` arguments, else the first. */
export type PickSig<D, Argc extends number> = D extends readonly unknown[]
	? PickLoop<D, Argc, 0>
	: D;
type PickLoop<
	D extends readonly unknown[],
	Argc extends number,
	I extends number,
> = D[I] extends infer S extends AnySig
	? Accepts<S["args"], Argc> extends true
		? S
		: PickLoop<D, Argc, Next<I>>
	: D[0];

/** The arguments a signature needs: all but a trailing `"..."`. */
export type MinArgs<A extends readonly string[]> = A extends readonly [
	...infer H extends readonly string[],
	"...",
]
	? H["length"]
	: A["length"];
export type MaxArgs<A extends readonly string[]> = A extends readonly [
	...unknown[],
	"...",
]
	? Many
	: A["length"];
type Accepts<
	A extends readonly string[],
	N extends number,
> = A extends readonly [...unknown[], "..."]
	? GE<N, MinArgs<A>>
	: N extends A["length"]
		? true
		: false;

/** The type a declared function takes at argument `I`. */
type SigArgType<S, I extends number> = S extends AnySig
	? S["args"][I] extends infer T extends string
		? T extends "..."
			? Repeated<S>
			: T
		: Repeated<S>
	: "unknown";
type Repeated<S extends AnySig> = S["args"] extends readonly [
	...unknown[],
	infer P extends string,
	"...",
]
	? P
	: "unknown";

/** The parameter slots of a call to a declared function with arguments `L`. */
export type SigSlots<
	S,
	L extends readonly unknown[],
	Acc extends readonly unknown[] = [],
> = Acc["length"] extends L["length"]
	? Acc
	: SigSlots<S, L, [...Acc, Info<SigArgType<S, Acc["length"]>, true>]>;

export type ArityOk<N extends number, Min extends number, Max extends number> =
	GE<N, Min> extends true ? (Max extends Many ? true : GE<Max, N>) : false;
