import type { Lt, Tup } from "./num.js";
import type { Members } from "./object.js";

export type Best<
	Name extends string,
	Cands,
	Fold extends boolean = false,
> = Pick2<Name, Members<Cands>, null, 3, Fold>;
type Pick2<
	Name extends string,
	Cs extends readonly unknown[],
	Best,
	BestD extends number,
	Fold extends boolean,
> = Cs extends readonly [infer C extends string, ...infer R]
	? (Fold extends true ? Lowercase<C> : C) extends Name
		? Pick2<Name, R, Best, BestD, Fold>
		: Dist<Name, Fold extends true ? Lowercase<C> : C> extends infer D extends
					number
			? Lt<D, BestD> extends true
				? Lt<D, Len<Name>> extends true
					? Pick2<Name, R, C, D, Fold>
					: Pick2<Name, R, Best, BestD, Fold>
				: Pick2<Name, R, Best, BestD, Fold>
			: never
	: Best;

type Chars<
	S extends string,
	Acc extends string[] = [],
> = S extends `${infer C}${infer R}` ? Chars<R, [...Acc, C]> : Acc;
type Len<S extends string> = Chars<S>["length"];

type Dist<A extends string, B extends string> =
	Abs<Len<A>, Len<B>> extends infer D extends number
		? Lt<2, D> extends true
			? 3
			: Lev<Chars<A>, Chars<B>>
		: never;

type Lev<A extends string[], B extends string[]> = A extends []
	? Cap<B["length"]>
	: B extends []
		? Cap<A["length"]>
		: A extends [infer AH, ...infer AT extends string[]]
			? B extends [infer BH, ...infer BT extends string[]]
				? AH extends BH
					? Lev<AT, BT>
					: Min3<Lev<AT, B>, Lev<A, BT>, Lev<AT, BT>> extends infer M extends
								number
						? Cap<Inc<M>>
						: never
				: never
			: never;

type Cap<N extends number> = Lt<N, 3> extends true ? N : 3;
type Inc<N extends number> = N extends 0 ? 1 : N extends 1 ? 2 : 3;
type Min3<A extends number, B extends number, C extends number> = Min<
	A,
	Min<B, C>
>;
type Min<A extends number, B extends number> = Lt<A, B> extends true ? A : B;
type Abs<A extends number, B extends number> =
	Lt<A, B> extends true ? Sub<B, A> : Sub<A, B>;
type Sub<A extends number, B extends number> =
	Tup<A> extends [...Tup<B>, ...infer R] ? R["length"] : 0;
