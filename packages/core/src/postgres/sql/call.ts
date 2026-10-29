import type { AnyErr, SqlError } from "../../errors.js";
import type { Query } from "../../query.js";
import type { KeyedRow, RowKeys } from "../../row-keys.js";
import type { HasDefaultable, Skip, WithDefaults } from "../../sql/inline.js";
import type { NamedParams } from "../../sql/named.js";
import type { SlotCarried, SlotTexts } from "../../sql/slots.js";
import type {
	HasSlots,
	Splice,
	SpliceCarried,
	Take,
} from "../../sql/splice.js";
import type {
	IsLiteral,
	NotLiteralMessage,
	Prepared,
	PText,
	Surface,
} from "../../sql/text.js";
import type {
	CacheSnapshots,
	CallEntry,
	IsUnion,
	ReadyCallTable,
} from "../engine/cache.js";
import type { CheckCarried } from "../engine/carried.js";
import type { ArgsOf, ParamsOf, RowOf, Validate } from "../engine/infer.js";

type ArgsFor<
	DB,
	TM,
	X extends string,
	Names extends string[],
	Encs extends readonly unknown[],
	M extends number,
> = Names extends []
	? M extends 0
		? []
		: Encs extends readonly []
			? ArgsOf<DB, TM, X>
			: Take<ArgsOf<DB, TM, X>, M>
	: [params: NamedParams<Names, Take<ArgsOf<DB, TM, X>, Names["length"]>>];

type CallCheck<DB, TM, Q extends string> =
	IsLiteral<Q> extends false
		? SqlError<NotLiteralMessage, 0>
		: HasSlots<Q> extends true
			? never
			: Prepared<Q> extends infer P
				? P extends [
						infer X extends string,
						string[],
						infer Encs extends readonly string[],
						infer M extends number,
					]
					? Validate<DB, X> extends infer V
						? V extends AnyErr
							? V
							: Carried<DB, TM, X, [...Skip<M>, ...Encs]> extends infer K
								? K extends AnyErr
									? K
									: DefaultsCheck<DB, Q, null>
								: never
						: never
					: P
				: never;

type CallArgs<DB, TM, Q extends string> =
	IsLiteral<Q> extends false
		? []
		: HasSlots<Q> extends true
			? []
			: Prepared<Q> extends [
						infer X extends string,
						infer Names extends string[],
						infer Encs extends readonly string[],
						infer M extends number,
					]
				? Validate<DB, X> extends AnyErr
					? []
					: ArgsFor<DB, TM, X, Names, Encs, M>
				: [];

type Carried<
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
> = K extends readonly null[] ? true : CheckCarried<DB, TM, X, K>;

type DefaultsCheck<DB, Q extends string, S> =
	HasDefaultable<Q> extends false
		? true
		: PText<WithDefaults<Q>> extends infer X extends string
			? (S extends null ? X : Splice<X, SlotTexts<S>>) extends infer X2 extends
					string
				? Extract<Validate<DB, X2>, AnyErr> extends infer E
					? [E] extends [never]
						? true
						: DefaultErr<E>
					: never
				: true
			: true;

type DefaultErr<E> =
	E extends SqlError<infer Msg extends string, infer At>
		? SqlError<`${Msg} (sql.param() sends DEFAULT for undefined)`, At>
		: E;

export type SplicedText<Q extends string, S> = Splice<PText<Q>, SlotTexts<S>>;

type SlottedCheck<DB, TM, Q extends string, S> =
	IsLiteral<Q> extends false
		? SqlError<NotLiteralMessage, 0>
		: Prepared<Q> extends infer P
			? P extends [
					infer T2 extends string,
					string[],
					infer Encs extends readonly string[],
					infer M extends number,
				]
				? Splice<T2, SlotTexts<S>> extends infer X
					? X extends string
						? string extends X
							? SqlError<
									"dynamic SQL fragment: the statement text is not a literal; use sql.as<Row>() to assert the row type",
									null
								>
							: Validate<DB, X> extends infer V
								? V extends AnyErr
									? V
									: Carried<
												DB,
												TM,
												X,
												[
													...Skip<M>,
													...Encs,
													...SpliceCarried<T2, SlotCarried<S>>,
												]
											> extends infer K
										? K extends AnyErr
											? K
											: DefaultsCheck<DB, Q, S>
										: never
								: never
						: X
					: never
				: P
			: never;

type SlottedArgs<DB, TM, Q extends string, S> =
	IsLiteral<Q> extends false
		? readonly unknown[]
		: Prepared<Q> extends [
					infer T2 extends string,
					infer Names extends string[],
					readonly unknown[],
					infer M extends number,
				]
			? Splice<T2, SlotTexts<S>> extends infer X extends string
				? string extends X
					? readonly unknown[]
					: Validate<DB, X> extends AnyErr
						? readonly unknown[]
						: Names extends []
							? M extends 0
								? []
								: Take<ArgsOf<DB, TM, X>, M>
							: [
									params: NamedParams<
										Names,
										Take<ArgsOf<DB, TM, X>, Names["length"]>
									>,
								]
				: readonly unknown[]
			: readonly unknown[];

export type SplicedOr<Q extends string, S> =
	SplicedText<Q, S> extends infer X extends string ? X : string;

export type GateCallCheck<DB, TM, Keys, Q extends string> =
	CallCached<DB, TM, Keys, Q> extends infer C extends CallEntry
		? [C] extends [never]
			? InferredCheck<DB, TM, Q>
			: C["g"]
		: never;

type InferredCheck<DB, TM, Q extends string> = [DB, TM, Q] extends [
	infer D,
	infer M,
	infer Q2 extends string,
]
	? Surface<CallCheck<D, M, Q2>>
	: never;

export type GateSlottedCheck<DB, TM, Q extends string, S> = [
	DB,
	TM,
	Q,
	S,
] extends [infer D, infer M, infer Q2 extends string, infer S2]
	? Surface<SlottedCheck<D, M, Q2, S2>>
	: never;

export type BoxCallArgs<DB, TM, Keys, Q extends string> = Extract<
	{
		[K in Q as `${K}`]: CallCached<DB, TM, Keys, K> extends infer C extends
			CallEntry
			? [C] extends [never]
				? CallArgs<DB, TM, K>
				: C["p"]
			: never;
	}[`${Q}`],
	readonly unknown[]
>;

export type BoxSlottedArgs<DB, TM, Q extends string, S> = Extract<
	{ [K in Q as `${K}`]: SlottedArgs<DB, TM, K, S> }[`${Q}`],
	readonly unknown[]
>;

export type CallCached<DB, TM, Keys, Q extends string> = [
	keyof CacheSnapshots,
] extends [never]
	? never
	: IsUnion<Q> extends true
		? never
		: [Q] extends [keyof ReadyCallTable<DB, TM, Keys>]
			? ReadyCallTable<DB, TM, Keys>[Q]
			: never;

export type CallTypes<DB, TM, Keys extends RowKeys, Q extends string> = {
	readonly g: GateCallCheck<DB, TM, Keys, Q>;
	readonly p: BoxCallArgs<DB, TM, Keys, Q>;
	readonly q: CallRet<DB, TM, Keys, Q>;
};

export type CallRet<DB, TM, Keys extends RowKeys, Q extends string> = [
	Q,
] extends [infer Q extends string]
	? CallCached<DB, TM, Keys, Q> extends infer C extends CallEntry
		? [C] extends [never]
			? Query<
					KeyedRow<RowOf<DB, TM, PText<Q>>, Keys>,
					ParamsOf<DB, TM, PText<Q>>,
					PText<Q>
				>
			: C["q"]
		: never
	: never;
