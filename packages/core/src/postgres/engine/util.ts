// Generic type helpers the PostgreSQL engine shares across its layers.

/** "eq", "more" or "fewer": whether A has as many items as B. */
export type WidthCheck<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends unknown
	? B extends unknown
		? number extends A["length"] | B["length"]
			? WidthCheckWalk<A, B>
			: A["length"] extends B["length"]
				? B["length"] extends A["length"]
					? "eq"
					: WidthCheckWalk<A, B>
				: WidthCheckWalk<A, B>
		: never
	: never;
type WidthCheckWalk<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends readonly [unknown, ...infer AR]
	? B extends readonly [unknown, ...infer BR]
		? WidthCheckWalk<AR, BR>
		: "more"
	: B extends readonly [unknown, ...unknown[]]
		? "fewer"
		: "eq";
