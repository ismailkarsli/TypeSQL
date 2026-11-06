import type { SqlError } from "./errors.js";
import type { InlineFragment } from "./query.js";
import type { Slottable } from "./sql/slots.js";

declare const EMPTY: unique symbol;

/** What `sql.optional(value)` gives for `undefined`: DEFAULT in sql.param, a skipped item in sql.combine/and/or. */
export interface Empty {
	readonly [EMPTY]: true;
}

/**
 * The omission of an optional fragment or query, which splices nothing as
 * `${…}`. Only it carries the string brand a template keeps: a branded
 * omission next to a `string` value (`x ?? omission`, `flag ? omission : x`)
 * would be reduced away with the DEFAULT it stands for.
 */
export type EmptyFragment = Empty & InlineFragment;

/**
 * `undefined` becomes the omission and `null` stays SQL `NULL`, as in
 * sql.set, sql.values and sql.json.
 */
export type Optional<T> =
	| Exclude<T, undefined>
	| ([Extract<T, undefined>] extends [never]
			? never
			: [Exclude<T, undefined | null>] extends [never]
				? Empty
				: [Exclude<T, undefined | null>] extends [Slottable]
					? EmptyFragment
					: Empty);

/** A `null` fragment would splice the text `null`, so it is an error. */
export type OptionalInput<T> = [Extract<T, null>] extends [never]
	? unknown
	: [Exclude<T, undefined | null>] extends [never]
		? unknown
		: [Exclude<T, undefined | null>] extends [Slottable]
			? SqlError<
					"use undefined, not null, to omit a fragment or query with sql.optional()",
					null
				>
			: unknown;

/** What `sql.if(value, then)` hands `then`: `value` without its falsy members. */
export type Truthy<V> = Exclude<V, null | undefined | false | 0 | 0n | "">;

/** The sentinel itself; only sql.optional, sql.if and sql.json(undefined) hand it out. */
// biome-ignore lint/nursery/noUnsafeTypeAssertion: `Empty` is a type-only brand; the sentinel is known by identity.
export const empty = {} as Empty;

export const optional = <const T>(value: T): Optional<T> =>
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: `Optional<T>` is a conditional type that the value cannot be checked against.
	(value === undefined ? empty : value) as never;
