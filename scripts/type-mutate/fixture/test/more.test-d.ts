import type { Op, Power } from "../src/logic.js";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

export type Tests = [
	Expect<Equal<Op, "and" | "or" | "not">>,
	Expect<Equal<Power<"not">, readonly [5, 6]>>,
];
