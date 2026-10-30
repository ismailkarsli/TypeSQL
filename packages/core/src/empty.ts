declare const EMPTY: unique symbol;

/** An explicit omission in sql.combine, or DEFAULT in an inline sql.param. */
export interface Empty {
	readonly [EMPTY]: true;
	<const T>(value: T): T extends null | undefined ? Empty : T;
}

export const empty: Empty = ((value: unknown) =>
	value === null || value === undefined ? empty : value) as Empty;

export function isEmpty(value: unknown): value is Empty {
	return value === empty;
}
