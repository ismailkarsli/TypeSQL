import type { EngineTypes } from "../engine/contract.js";
import type { ParamsOf, RowOf } from "../engine/infer.js";
import type {
	InsertInput,
	RelationName,
	SetInput,
	TableName,
} from "../engine/write.js";
import type {
	PluginEncoded,
	PluginInput,
	PluginOutput,
	SqlPlugin,
} from "../plugin.js";
import type { Fragment, Query } from "../query.js";
import type {
	BoxCallArgs,
	BoxSlottedArgs,
	CallRet,
	GateCallCheck,
	GateSlottedCheck,
	SplicedOr,
} from "./call.js";
import type {
	BoxFragArgs,
	CombineOf,
	CombineSeparator,
	FragCarried,
	FragCount,
	GateFragCheck,
	LiteralParts,
} from "./fragment.js";
import type { InlineMarker, JsonMarker } from "./inline.js";
import type { SlotCarried, SlotMap, SlotsFor, Slottable } from "./slots.js";
import type { QuotedIdent, SpliceCarried, UnknownTuple } from "./splice.js";
import type { PText } from "./text.js";
import type { NoExtraKeys, SetRep, ValuesRep } from "./write.js";

type Parameters<Input, P extends readonly SqlPlugin[]> = Extract<
	PluginInput<
		Input,
		P,
		{ readonly kind: "parameters"; readonly query: string }
	>,
	readonly unknown[]
>;
type EncodedParameters<Input, P extends readonly SqlPlugin[]> = Extract<
	PluginEncoded<
		Input,
		P,
		{ readonly kind: "parameters"; readonly query: string }
	>,
	readonly unknown[]
>;
type WriteInput<
	Input,
	P extends readonly SqlPlugin[],
	Kind extends "set" | "values",
	T extends string,
> = PluginInput<Input, P, { readonly kind: Kind; readonly table: T }>;
type WriteEncoded<
	Input,
	P extends readonly SqlPlugin[],
	Kind extends "set" | "values",
	T extends string,
> = PluginEncoded<Input, P, { readonly kind: Kind; readonly table: T }>;

export interface SqlApi<
	E extends EngineTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
> {
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): SqlApi<E, DB, TM, [...Plugins, P]>;
	<const Q extends string>(
		query: GateCallCheck<E, DB, TM, Q> & Q,
		...params: Parameters<BoxCallArgs<E, DB, TM, Q>, Plugins>
	): CallRet<E, DB, TM, Q, Plugins>;
	prepare<const Q extends string>(
		query: GateCallCheck<E, DB, TM, Q> & Q,
	): (
		...params: Parameters<BoxCallArgs<E, DB, TM, Q>, Plugins>
	) => CallRet<E, DB, TM, Q, Plugins>;
	prepare<const Q extends string, const S extends SlotMap>(
		query: GateSlottedCheck<E, DB, TM, Q, S> & Q,
		slots: S & SlotsFor<Q, S>,
	): (
		...params: Parameters<BoxSlottedArgs<E, DB, TM, Q, S>, Plugins>
	) => Query<
		PluginOutput<RowOf<E, DB, TM, SplicedOr<Q, S>>, Plugins>,
		Parameters<ParamsOf<E, DB, TM, SplicedOr<Q, S>>, Plugins>,
		SplicedOr<Q, S>
	>;
	<const Q extends string, const S extends SlotMap>(
		query: GateSlottedCheck<E, DB, TM, Q, S> & Q,
		slots: S & SlotsFor<Q, S>,
		...params: Parameters<BoxSlottedArgs<E, DB, TM, Q, S>, Plugins>
	): Query<
		PluginOutput<RowOf<E, DB, TM, SplicedOr<Q, S>>, Plugins>,
		Parameters<ParamsOf<E, DB, TM, SplicedOr<Q, S>>, Plugins>,
		SplicedOr<Q, S>
	>;

	as<Row>(
		query: string,
		...params: readonly unknown[]
	): Query<Row, readonly unknown[]>;
	as<Row>(
		query: string,
		slots: SlotMap,
		...params: readonly unknown[]
	): Query<Row, readonly unknown[]>;

	param<const T>(
		value: T,
	): InlineMarker<PluginEncoded<T, Plugins, { readonly kind: "value" }>>;

	json<const T>(value: T): JsonMarker<T>;

	fragment<const Text extends string, const A extends readonly unknown[]>(
		text: GateFragCheck<Text, false> & Text,
		...params: A & Parameters<BoxFragArgs<Text>, Plugins>
	): Fragment<
		PText<Text>,
		UnknownTuple<FragCount<Text>>,
		FragCarried<Text, EncodedParameters<A, Plugins>>
	>;
	fragment<
		const Text extends string,
		const S extends SlotMap,
		const A extends readonly unknown[],
	>(
		text: GateFragCheck<Text, true> & Text,
		slots: S & SlotsFor<Text, S>,
		...params: A & Parameters<BoxFragArgs<Text>, Plugins>
	): Fragment<
		SplicedOr<Text, S>,
		readonly unknown[],
		[
			...FragCarried<Text, EncodedParameters<A, Plugins>>,
			...SpliceCarried<PText<Text>, SlotCarried<S>>,
		]
	>;

	id<const Parts extends readonly [string, ...string[]]>(
		...parts: Parts & LiteralParts<Parts>
	): Fragment<QuotedIdent<Parts>, [], []>;
	id(name: RelationName<DB>): Fragment<QuotedIdent<[RelationName<DB>]>, [], []>;
	id(...parts: readonly [string, ...string[]]): Fragment<string, [], []>;

	combine<
		const Items extends readonly Slottable[],
		const Sep extends CombineSeparator = ", ",
	>(
		items: Items,
		options?: { readonly separator?: Sep },
	): CombineOf<Items, Sep>;

	set<const T extends TableName<DB>, const P>(
		table: T,
		values: P &
			(P extends WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>
				? NoExtraKeys<P, WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>>
				: never),
	): Fragment<
		SetRep<WriteEncoded<P, Plugins, "set", T>>["text"],
		readonly unknown[],
		SetRep<WriteEncoded<P, Plugins, "set", T>>["carried"]
	>;

	values<const T extends TableName<DB>, const R extends readonly unknown[]>(
		table: T,
		rows: R & {
			readonly [I in keyof R]: R[I] extends WriteInput<
				InsertInput<E, DB, TM, T>,
				Plugins,
				"values",
				T
			>
				? NoExtraKeys<
						R[I],
						WriteInput<InsertInput<E, DB, TM, T>, Plugins, "values", T>
					>
				: never;
		},
	): Fragment<
		ValuesRep<WriteEncoded<R[number], Plugins, "values", T>>["text"],
		readonly unknown[],
		ValuesRep<WriteEncoded<R[number], Plugins, "values", T>>["carried"]
	>;

	raw(text: string): Fragment<string, [], []>;
}
