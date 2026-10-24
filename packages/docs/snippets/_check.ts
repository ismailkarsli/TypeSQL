/** Type assertions for documentation examples: `check<Equal<A, B>>()` fails to compile when A ≠ B. */
export type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
export function check<T extends true>(): T | void {}
/** Mutual assignability, for types `Equal` treats as distinct only because of their internal representation. */
export type Same<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: false
	: false;
