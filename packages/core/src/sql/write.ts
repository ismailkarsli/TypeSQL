import type { Next } from "../engine/next.js";
import type { Members } from "../engine/object.js";
import type { ColDesc, Table, TableOf } from "../schema.js";
import type { EngineTypes, TsParamTypeOf } from "./contract.js";
import type {
	AnyDefaultMarker,
	JsonDefaultValue,
	JsonValue,
	ValueEnc,
} from "./inline.js";
import type { QuotedIdent } from "./splice.js";

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

export type SetRep<P, Q extends string> =
	Members<KeysOf<P>> extends infer Ks extends readonly unknown[]
		? {
				readonly text: JoinAssignments<Ks, Q>;
				readonly carried: CarriedOfKeys<Flat<P>, Ks>;
			}
		: never;

export type ValuesRep<R, Q extends string, Empty extends string> =
	Members<KeysOf<R>> extends infer Ks extends readonly unknown[]
		? Ks extends readonly []
			? { readonly text: Empty; readonly carried: [] }
			: {
					readonly text: `(${JoinNames<Ks, Q>}) VALUES (${JoinPlaceholders<Ks>})`;
					readonly carried: CarriedOfKeys<Flat<R>, Ks>;
				}
		: never;

/** A value `sql.values` leaves out of its row: `undefined`, or a DEFAULT marker. */
type MayOmit = undefined | AnyDefaultMarker;
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

type SendsAt<R, K extends string> = R extends unknown
	? K extends keyof R
		? [Exclude<R[K], MayOmit>] extends [never]
			? false
			: true
		: false
	: never;
type OmitsAt<R, K extends string> = R extends unknown
	? K extends keyof R
		? Pick<R, K> extends Required<Pick<R, K>>
			? [Extract<R[K], MayOmit>] extends [never]
				? false
				: true
			: true
		: true
	: never;
/** The columns one row sends and another row leaves out, or may. */
type Varying<R> = {
	[K in KeysOf<R>]: true extends SendsAt<R, K>
		? true extends OmitsAt<R, K>
			? K
			: never
		: never;
}[KeysOf<R>];
/**
 * Without DEFAULT in a VALUES row (SQLite), the rows of `sql.values` send the
 * same columns: a column one row sends, every row of several must send.
 */
export type SameColumns<
	E extends EngineTypes,
	R extends readonly unknown[],
> = E["valuesDefault"] extends true
	? unknown
	: R extends readonly [unknown]
		? unknown
		: {
				// biome-ignore lint/plugin: any value but undefined is sent, whatever the column.
				readonly [I in keyof R]: {
					readonly [K in Varying<R[number]>]-?: NonNullable<unknown> | null;
				};
			};

type ColIn<
	E extends EngineTypes,
	TM,
	DB,
	D extends ColDesc,
> = D["type"] extends "null"
	? null
	:
			| (D["nullable"] extends true
					? TsParamTypeOf<E, TM, DB, D["type"]> | null
					: TsParamTypeOf<E, TM, DB, D["type"]>)
			| (D["type"] extends E["json"] ? JsonValue | JsonDefaultValue : never);

export type SetInput<E extends EngineTypes, DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? {
				readonly [K in Writable<Tbl>]?: ColIn<E, TM, DB, Tbl[K]> | undefined;
			}
		: never;

type Writable<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends
		| { readonly generated: true }
		| { readonly hidden: true }
		? never
		: K;
}[keyof Tbl];

type Required_<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends {
		readonly nullable: false;
		readonly hasDefault: false;
	}
		? K
		: never;
}[keyof Tbl];

export type InsertInput<E extends EngineTypes, DB, TM, T extends string> =
	TableOf<DB, T> extends infer Tbl extends Table
		? Spread<
				{ readonly [K in Required_<Tbl>]: ColIn<E, TM, DB, Tbl[K]> } & {
					readonly [K in Exclude<Writable<Tbl>, Required_<Tbl>>]?:
						| ColIn<E, TM, DB, Tbl[K]>
						| undefined;
				}
			>
		: never;
type Spread<O> = { [K in keyof O]: O[K] };
