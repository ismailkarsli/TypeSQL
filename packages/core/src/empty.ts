declare const EMPTY: unique symbol;

/** What `sql.optional(value)` gives for `undefined`: DEFAULT in sql.param, a skipped item in sql.combine/and/or. */
export interface Empty {
	readonly [EMPTY]: true;
}

/** The sentinel itself; only sql.optional, sql.if and sql.json(undefined) hand it out. */
// biome-ignore lint/nursery/noUnsafeTypeAssertion: `Empty` is a type-only brand; the sentinel is known by identity.
export const empty = {} as Empty;
