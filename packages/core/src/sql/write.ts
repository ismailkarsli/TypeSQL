import type { ValueEnc } from "./inline.js";
import type { Next } from "./next.js";
import type { QuotedIdent, UnionList } from "./splice.js";

export type NoExtraKeys<P, Allowed> = Allowed extends unknown
	? P & {
			readonly [K in Exclude<keyof P, keyof Allowed>]: never;
		}
	: never;

type KeysOf<R> = R extends unknown ? keyof R & string : never;
type ValueAt<R, K extends string> = R extends unknown
	? K extends keyof R
		? R[K]
		: never
	: never;
type Flat<R> = R extends unknown ? { readonly [K in keyof R]: R[K] } : never;
type CarriedOfKeys<
	R,
	Ks extends readonly unknown[],
	Acc extends readonly unknown[] = [],
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? CarriedOfKeys<
			R,
			Rest,
			[...Acc, ValueEnc<Exclude<ValueAt<R, K>, undefined>>]
		>
	: Acc;

type JoinAssignments<
	Ks extends readonly unknown[],
	Q extends string,
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinAssignments<
			Rest,
			Q,
			Next<N>,
			Acc extends ""
				? `${QuotedIdent<[K], Q>} = $${N}`
				: `${Acc}, ${QuotedIdent<[K], Q>} = $${N}`
		>
	: Acc;
type JoinNames<
	Ks extends readonly unknown[],
	Q extends string,
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinNames<
			Rest,
			Q,
			Acc extends "" ? QuotedIdent<[K], Q> : `${Acc}, ${QuotedIdent<[K], Q>}`
		>
	: Acc;
type JoinPlaceholders<
	Ks extends readonly unknown[],
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [string, ...infer Rest]
	? JoinPlaceholders<Rest, Next<N>, Acc extends "" ? `$${N}` : `${Acc}, $${N}`>
	: Acc;

export type SetRep<P, Q extends string = '"'> =
	UnionList<KeysOf<P>> extends infer Ks extends readonly unknown[]
		? {
				readonly text: JoinAssignments<Ks, Q>;
				readonly carried: CarriedOfKeys<Flat<P>, Ks>;
			}
		: never;

export type ValuesRep<
	R,
	Q extends string = '"',
	Empty extends string = "DEFAULT VALUES",
> =
	UnionList<KeysOf<R>> extends infer Ks extends readonly unknown[]
		? Ks extends readonly []
			? { readonly text: Empty; readonly carried: [] }
			: {
					readonly text: `(${JoinNames<Ks, Q>}) VALUES (${JoinPlaceholders<Ks>})`;
					readonly carried: CarriedOfKeys<Flat<R>, Ks>;
				}
		: never;

/** A value `sql.values` leaves out of its row: `undefined`, or a DEFAULT marker. */
type MayOmit = undefined | `\u0000Du${string}\u0000`;
/** Keys every row has, with a value that is always sent. */
type AlwaysSent<R> = {
	[K in KeysOf<R>]: [R] extends [{ readonly [P in K]: ValueAt<R, K> }]
		? [Extract<ValueAt<R, K>, MayOmit>] extends [never]
			? K
			: never
		: never;
}[KeysOf<R>];
type PickEach<R, K> = R extends unknown
	? { readonly [P in K & keyof R]: R[P] }
	: never;
/** The rows with only the columns `sql.values` always sends. */
export type SentRows<R> = PickEach<R, AlwaysSent<R>>;
