import type { AnyErr, SqlError } from "../errors.js";
import type { PluginInput, PluginOutput, SqlPlugin } from "../plugin.js";
import type { Query } from "../query.js";
import type { CheckCarried } from "./carried.js";
import type { EngineTypes } from "./contract.js";
import type { ArgsOf, ParamsOf, RowOf, Validate } from "./infer.js";
import type { HasDefaultable, Skip, WithDefaults } from "./inline.js";
import type {
	Inlined,
	InlinedSlots,
	InlinedText,
	QuotedSlot,
} from "./inline-fragment.js";
import type { Lexis } from "./lexis.js";
import type { NamedArgs } from "./named.js";
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
	S,
> = Names extends []
	? M extends 0
		? []
		: [S, Encs] extends [null, readonly []]
			? ArgsOf<E, DB, TM, X>
			: Take<ArgsOf<E, DB, TM, X>, M>
	: NamedArgs<Names, ArgsOf<E, DB, TM, X>>;

type Carried<
	E extends EngineTypes,
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
> = K extends readonly (null | "*")[] ? true : CheckCarried<E, DB, TM, X, K>;

type DefaultsCheck<E extends EngineTypes, DB, Q extends string, S> =
	HasDefaultable<Q> extends false
		? true
		: PText<WithDefaults<Q>, E["lexis"]> extends infer X extends string
			? (
					S extends null
						? X
						: Splice<X, SlotTexts<S>, E["lexis"]>
				) extends infer X2 extends string
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
export type SplicedText<Q extends string, L extends Lexis> =
	SlotVariants<InlinedSlots<Q>> extends infer V
		? V extends unknown
			? Splice<PText<InlinedText<Q>, L>, SlotTexts<V>, L>
			: never
		: never;

/** The check of a statement whose `${fragment}`s became slots `S` (`null`: none). */
type SpliceCheck<E extends EngineTypes, DB, TM, Q extends string, S> =
	IsLiteral<Q> extends false
		? SqlError<NotLiteralMessage, 0>
		: Prepared<Q, E["lexis"]> extends infer P
			? P extends [
					infer T2 extends string,
					string[],
					infer Encs extends readonly string[],
					infer M extends number,
				]
				? Spliced<T2, S, E["lexis"]> extends infer X
					? X extends string
						? Validate<E, DB, X> extends AnyErr
							? Validate<E, DB, X>
							: Carried<
										E,
										DB,
										TM,
										X,
										[
											...Skip<M>,
											...Encs,
											...([S] extends [null]
												? []
												: SpliceCarried<
														T2,
														SlotCarried<S, E["lexis"]>,
														E["lexis"]
													>),
										]
									> extends infer K
								? K extends AnyErr
									? K
									: DefaultsCheck<E, DB, Q, S>
								: never
						: X
					: never
				: P
			: never;

type Spliced<T2 extends string, S, L extends Lexis> = [S] extends [null]
	? T2
	: Splice<T2, SlotTexts<S>, L> extends infer X
		? X extends string
			? string extends X
				? SqlError<
						"dynamic SQL fragment: the statement text is not a literal; use sql.as<Row>() to assert the row type",
						null
					>
				: X
			: X
		: never;

/**
 * Any arguments when the statement is invalid: an arity mismatch would
 * otherwise be reported instead of the statement's SqlError.
 */
type SpliceArgs<E extends EngineTypes, DB, TM, Q extends string, S> =
	IsLiteral<Q> extends false
		? readonly unknown[]
		: Prepared<Q, E["lexis"]> extends [
					infer T2 extends string,
					infer Names extends string[],
					infer Encs extends readonly string[],
					infer M extends number,
				]
			? Spliced<T2, S, E["lexis"]> extends infer X extends string
				? Validate<E, DB, X> extends AnyErr
					? readonly unknown[]
					: ArgsFor<E, DB, TM, X, Names, Encs, M, S>
				: readonly unknown[]
			: readonly unknown[];

export type GateCallCheck<E extends EngineTypes, DB, TM, Q extends string> = [
	Q,
] extends [infer Q2 extends string]
	? Inlined<Q2> extends infer I
		? [I] extends [null]
			? InferredCheck<E, DB, TM, Q2>
			: I extends AnyErr
				? I
				: I extends readonly [infer T2 extends string, infer S2]
					? [QuotedSlot<T2, E["lexis"]>] extends [infer QE]
						? [QE] extends [never]
							? Surface<
									SlotVariants<S2> extends infer V
										? V extends unknown
											? SpliceCheck<E, DB, TM, T2, V>
											: never
										: never
								>
							: QE
						: never
					: never
		: never
	: never;

type InferredCheck<E extends EngineTypes, DB, TM, Q extends string> = Surface<
	SpliceCheck<E, DB, TM, Q, null>
>;

export type BoxCallArgs<E extends EngineTypes, DB, TM, Q extends string> = [
	Q,
] extends [infer Q2 extends string]
	? Inlined<Q2> extends infer I
		? [I] extends [null]
			? Extract<
					{ [K in Q2 as `${K}`]: SpliceArgs<E, DB, TM, K, null> }[`${Q2}`],
					readonly unknown[]
				>
			: I extends AnyErr
				? readonly unknown[]
				: I extends readonly [infer T2 extends string, infer S2]
					? Extract<
							{ [K in T2 as `${K}`]: SpliceArgs<E, DB, TM, K, S2> }[`${T2}`],
							readonly unknown[]
						>
					: never
		: never
	: never;

/** The text sql() types: interpolated fragments spliced in. */
type CallText<Q extends string, L extends Lexis> = [Q] extends [
	infer Q2 extends string,
]
	? Inlined<Q2> extends null
		? PText<Q2, L>
		: SplicedOr<Q2, L>
	: never;

type SplicedOr<Q extends string, L extends Lexis> =
	SplicedText<Q, L> extends infer X extends string ? X : string;

/**
 * Resolved to `Query<Row, Params, Text>`, so declaration emit names only the
 * row, parameter and text types, never the schema, type map or plugins an
 * application keeps private to the module that creates its `sql`.
 */
export type CallRet<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
	Plugins extends readonly SqlPlugin[] = [],
> = [CallText<Q, E["lexis"]>] extends [infer X extends string]
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
