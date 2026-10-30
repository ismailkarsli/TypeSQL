import type { CheckCarried } from "../engine/carried.js";
import type { EngineTypes } from "../engine/contract.js";
import type { ArgsOf, ParamsOf, RowOf, Validate } from "../engine/infer.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { PluginInput, PluginOutput, SqlPlugin } from "../plugin.js";
import type { Query } from "../query.js";
import type { HasDefaultable, Skip, WithDefaults } from "./inline.js";
import type { NamedParams } from "./named.js";
import type { SlotCarried, SlotTexts, SlotVariants } from "./slots.js";
import type { HasSlots, Splice, SpliceCarried, Take } from "./splice.js";
import type {
	IsLiteral,
	NotLiteralMessage,
	Prepared,
	PText,
	Surface,
} from "./text.js";

type ArgsFor<
	E extends EngineTypes,
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
			? ArgsOf<E, DB, TM, X>
			: Take<ArgsOf<E, DB, TM, X>, M>
	: [params: NamedParams<Names, Take<ArgsOf<E, DB, TM, X>, Names["length"]>>];

type CallCheck<E extends EngineTypes, DB, TM, Q extends string> =
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
					? Validate<E, DB, X> extends infer V
						? V extends AnyErr
							? V
							: Carried<E, DB, TM, X, [...Skip<M>, ...Encs]> extends infer K
								? K extends AnyErr
									? K
									: DefaultsCheck<E, DB, Q, null>
								: never
						: never
					: P
				: never;

type CallArgs<E extends EngineTypes, DB, TM, Q extends string> =
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
				? Validate<E, DB, X> extends AnyErr
					? []
					: ArgsFor<E, DB, TM, X, Names, Encs, M>
				: [];

type Carried<
	E extends EngineTypes,
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
> = K extends readonly null[] ? true : CheckCarried<E, DB, TM, X, K>;

type DefaultsCheck<E extends EngineTypes, DB, Q extends string, S> =
	HasDefaultable<Q> extends false
		? true
		: PText<WithDefaults<Q>> extends infer X extends string
			? (S extends null ? X : Splice<X, SlotTexts<S>>) extends infer X2 extends
					string
				? Extract<Validate<E, DB, X2>, AnyErr> extends infer Err
					? [Err] extends [never]
						? true
						: DefaultErr<Err>
					: never
				: true
			: true;

type DefaultErr<Err> =
	Err extends SqlError<infer Msg extends string, infer At>
		? SqlError<`${Msg} (sql.param() sends DEFAULT for sql.empty)`, At>
		: Err;

export type SplicedText<Q extends string, S> = Splice<PText<Q>, SlotTexts<S>>;

type SlottedCheck<E extends EngineTypes, DB, TM, Q extends string, S> =
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
							: Validate<E, DB, X> extends infer V
								? V extends AnyErr
									? V
									: Carried<
												E,
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
											: DefaultsCheck<E, DB, Q, S>
										: never
								: never
						: X
					: never
				: P
			: never;

type SlottedArgs<E extends EngineTypes, DB, TM, Q extends string, S> =
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
					: Validate<E, DB, X> extends AnyErr
						? readonly unknown[]
						: Names extends []
							? M extends 0
								? []
								: Take<ArgsOf<E, DB, TM, X>, M>
							: [
									params: NamedParams<
										Names,
										Take<ArgsOf<E, DB, TM, X>, Names["length"]>
									>,
								]
				: readonly unknown[]
			: readonly unknown[];

export type SplicedOr<Q extends string, S> =
	SplicedText<Q, S> extends infer X extends string ? X : string;

export type GateCallCheck<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
> = InferredCheck<E, DB, TM, Q>;

type InferredCheck<E extends EngineTypes, DB, TM, Q extends string> = [
	DB,
	TM,
	Q,
] extends [infer D, infer M, infer Q2 extends string]
	? Surface<CallCheck<E, D, M, Q2>>
	: never;

export type GateSlottedCheck<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
	S,
> = [DB, TM, Q, S] extends [infer D, infer M, infer Q2 extends string, infer S2]
	? Surface<
			SlotVariants<S2> extends infer V
				? V extends unknown
					? SlottedCheck<E, D, M, Q2, V>
					: never
				: never
		>
	: never;

export type BoxCallArgs<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
> = Extract<
	{
		[K in Q as `${K}`]: CallArgs<E, DB, TM, K>;
	}[`${Q}`],
	readonly unknown[]
>;

export type BoxSlottedArgs<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
	S,
> = Extract<
	{ [K in Q as `${K}`]: SlottedArgs<E, DB, TM, K, S> }[`${Q}`],
	readonly unknown[]
>;

export type CallRet<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
	Plugins extends readonly SqlPlugin[] = [],
> = [Q] extends [infer Q extends string]
	? Query<
			PluginOutput<RowOf<E, DB, TM, PText<Q>>, Plugins>,
			Extract<
				PluginInput<
					ParamsOf<E, DB, TM, PText<Q>>,
					Plugins,
					{ readonly kind: "parameters"; readonly query: string }
				>,
				readonly unknown[]
			>,
			PText<Q>
		>
	: never;
