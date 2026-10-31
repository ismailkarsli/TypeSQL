import type { CheckCarried } from "../engine/carried.js";
import type { EngineTypes } from "../engine/contract.js";
import type { ArgsOf, ParamsOf, RowOf, Validate } from "../engine/infer.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { PluginInput, PluginOutput, SqlPlugin } from "../plugin.js";
import type { Query } from "../query.js";
import type { HasDefaultable, Skip, WithDefaults } from "./inline.js";
import type { Inlined, InlinedSlots, InlinedText } from "./inline-fragment.js";
import type { NamedParams } from "./named.js";
import type { SlotCarried, SlotTexts, SlotVariants } from "./slots.js";
import type { Splice, SpliceCarried, Take } from "./splice.js";
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
		? SqlError<
				`${Msg} (sql.param(sql.optional(…)) and sql.json(undefined) send DEFAULT)`,
				At
			>
		: Err;

/**
 * The statement with its interpolated fragments spliced in, one text for each
 * combination of union fragments (`${flag ? a : b}`, `sql.optional`, `sql.if`):
 * spliced together, a union fragment's parameters would leave the offset of
 * the next fragment's parameters a union, and mix their numbers.
 */
export type SplicedText<Q extends string> =
	SlotVariants<InlinedSlots<Q>> extends infer V
		? V extends unknown
			? Splice<PText<InlinedText<Q>>, SlotTexts<V>>
			: never
		: never;

/** The check of a statement whose `${fragment}`s became slots `S`. */
type SpliceCheck<E extends EngineTypes, DB, TM, Q extends string, S> =
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

type SpliceArgs<E extends EngineTypes, DB, TM, Q extends string, S> =
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

type SplicedOr<Q extends string> =
	SplicedText<Q> extends infer X extends string ? X : string;

// Boxed like InferredCheck, so relating two instantiations of the call
// signature (TransactionalSql extends Sql) does not evaluate Inlined<Q>.
export type GateCallCheck<E extends EngineTypes, DB, TM, Q extends string> = [
	Q,
] extends [infer Q2 extends string]
	? Inlined<Q2> extends null
		? InferredCheck<E, DB, TM, Q2>
		: InlineCheck<E, DB, TM, Q2>
	: never;

type InferredCheck<E extends EngineTypes, DB, TM, Q extends string> = [
	DB,
	TM,
	Q,
] extends [infer D, infer M, infer Q2 extends string]
	? Surface<CallCheck<E, D, M, Q2>>
	: never;

type InlineCheck<E extends EngineTypes, DB, TM, Q extends string> =
	Inlined<Q> extends infer I extends AnyErr
		? I
		: [DB, TM, InlinedText<Q>, InlinedSlots<Q>] extends [
					infer D,
					infer M,
					infer Q2 extends string,
					infer S2,
				]
			? Surface<
					SlotVariants<S2> extends infer V
						? V extends unknown
							? SpliceCheck<E, D, M, Q2, V>
							: never
						: never
				>
			: never;

export type BoxCallArgs<E extends EngineTypes, DB, TM, Q extends string> = [
	Q,
] extends [infer Q2 extends string]
	? Inlined<Q2> extends null
		? Extract<
				{
					[K in Q2 as `${K}`]: CallArgs<E, DB, TM, K>;
				}[`${Q2}`],
				readonly unknown[]
			>
		: InlineArgs<E, DB, TM, Q2>
	: never;

type InlineArgs<E extends EngineTypes, DB, TM, Q extends string> =
	Inlined<Q> extends AnyErr
		? readonly unknown[]
		: [InlinedText<Q>, InlinedSlots<Q>] extends [
					infer Q2 extends string,
					infer S2,
				]
			? Extract<
					{ [K in Q2 as `${K}`]: SpliceArgs<E, DB, TM, K, S2> }[`${Q2}`],
					readonly unknown[]
				>
			: never;

/** The text sql() types: interpolated fragments spliced in. */
type CallText<Q extends string> = [Q] extends [infer Q2 extends string]
	? Inlined<Q2> extends null
		? PText<Q2>
		: SplicedOr<Q2>
	: never;

export type CallRet<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
	Plugins extends readonly SqlPlugin[] = [],
> = [CallText<Q>] extends [infer X extends string]
	? Query<
			PluginOutput<RowOf<E, DB, TM, X>, Plugins>,
			Extract<
				PluginInput<
					ParamsOf<E, DB, TM, X>,
					Plugins,
					{ readonly kind: "parameters"; readonly query: string }
				>,
				readonly unknown[]
			>,
			X
		>
	: never;
