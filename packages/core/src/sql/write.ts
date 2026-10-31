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
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinAssignments<
			Rest,
			Next[N],
			Acc extends ""
				? `${QuotedIdent<[K]>} = $${N}`
				: `${Acc}, ${QuotedIdent<[K]>} = $${N}`
		>
	: Acc;
type JoinNames<
	Ks extends readonly unknown[],
	Acc extends string = "",
> = Ks extends readonly [infer K extends string, ...infer Rest]
	? JoinNames<
			Rest,
			Acc extends "" ? QuotedIdent<[K]> : `${Acc}, ${QuotedIdent<[K]>}`
		>
	: Acc;
type JoinPlaceholders<
	Ks extends readonly unknown[],
	N extends number = 1,
	Acc extends string = "",
> = Ks extends readonly [string, ...infer Rest]
	? JoinPlaceholders<Rest, Next[N], Acc extends "" ? `$${N}` : `${Acc}, $${N}`>
	: Acc;

export type SetRep<P> =
	UnionList<KeysOf<P>> extends infer Ks extends readonly unknown[]
		? {
				readonly text: JoinAssignments<Ks>;
				readonly carried: CarriedOfKeys<P, Ks>;
			}
		: never;

export type ValuesRep<R> =
	UnionList<KeysOf<R>> extends infer Ks extends readonly unknown[]
		? Ks extends readonly []
			? { readonly text: "DEFAULT VALUES"; readonly carried: [] }
			: {
					readonly text: `(${JoinNames<Ks>}) VALUES (${JoinPlaceholders<Ks>})`;
					readonly carried: CarriedOfKeys<R, Ks>;
				}
		: never;

/** A value `sql.values` leaves out of its row: `undefined`, or a DEFAULT marker. */
type MayOmit = undefined | `\u0000Du${string}\u0000`;
/** Keys every row has, with a value that is always sent. */
type AlwaysSent<R> = {
	[K in KeysOf<R>]: [R] extends [{ readonly [P in K]: unknown }]
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
