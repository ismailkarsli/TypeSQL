import type { First, IsNull, Nullable, Power, Swap } from "../src/logic.js";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

export type Tests = [
	Expect<Equal<IsNull<null>, true>>,
	Expect<Equal<IsNull<1>, false>>,
	Expect<Equal<Power<"and">, readonly [2, 3]>>,
	Expect<Equal<First<["a", 1]>, "a">>,
	Expect<Equal<Swap<readonly [1, 2]>, readonly [2, 1]>>,
	Expect<Equal<Nullable<{ nullable: true }>, "yes">>,
];
