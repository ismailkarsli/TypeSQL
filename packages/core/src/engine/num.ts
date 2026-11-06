import type { Digit } from "./chars.js";

/** A tuple of `N` elements `E`, for arithmetic on small numbers. */
export type Tup<
	N extends number,
	E = 0,
	A extends unknown[] = [],
> = A["length"] extends N ? A : Tup<N, E, [...A, E]>;

export type Add<A extends number, B extends number> = [
	...Tup<A>,
	...Tup<B>,
]["length"] &
	number;

export type Lt<A extends number, B extends number> = A extends B
	? false
	: Tup<B> extends [...Tup<A>, ...unknown[]]
		? true
		: false;

export type GE<A extends number, B extends number> =
	Tup<A> extends [...Tup<B>, ...unknown[]] ? true : false;

/** The length of `S`, or `Cap` when it has `Cap` or more characters. */
export type CappedLen<
	S extends string,
	Cap extends number,
	A extends unknown[] = [],
> = S extends `${string}${infer R}`
	? A["length"] extends Cap
		? Cap
		: CappedLen<R, Cap, [...A, 0]>
	: A["length"];

export type ToNum<S extends string> = S extends `${infer N extends number}`
	? N
	: never;

/** Whether the digits `A` are at most the digits `B`, which have as many. */
export type DigitsLE<
	A extends string,
	B extends string,
> = A extends `${infer X extends Digit}${infer AR}`
	? B extends `${infer Y extends Digit}${infer BR}`
		? X extends Y
			? DigitsLE<AR, BR>
			: GE<ToNum<Y>, ToNum<X>>
		: false
	: true;
