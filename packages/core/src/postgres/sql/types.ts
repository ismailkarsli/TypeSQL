import type { Fragment, Query } from "../../query.js";
import type { KeyedRow, RowKeys } from "../../row-keys.js";
import type {
	BoxFragArgs,
	CombineOf,
	CombineSeparator,
	FragCarried,
	FragCount,
	GateFragCheck,
	LiteralParts,
} from "../../sql/fragment.js";
import type { InlineMarker, JsonMarker } from "../../sql/inline.js";
import type {
	SlotCarried,
	SlotMap,
	SlotsFor,
	Slottable,
} from "../../sql/slots.js";
import type {
	QuotedIdent,
	SpliceCarried,
	UnknownTuple,
} from "../../sql/splice.js";
import type { PText } from "../../sql/text.js";
import type { NoExtraKeys, SetRep, ValuesRep } from "../../sql/write.js";
import type { ParamsOf, RowOf } from "../engine/infer.js";
import type {
	InsertInput,
	RelationName,
	SetInput,
	TableName,
} from "../engine/write.js";
import type {
	BoxCallArgs,
	BoxSlottedArgs,
	CallRet,
	GateCallCheck,
	GateSlottedCheck,
	SplicedOr,
} from "./call.js";

export interface Sql<DB, TM, Keys extends RowKeys = "preserve"> {
	<const Q extends string>(
		query: GateCallCheck<DB, TM, Keys, Q> & Q,
		...params: BoxCallArgs<DB, TM, Keys, Q>
	): CallRet<DB, TM, Keys, Q>;
	prepare<const Q extends string>(
		query: GateCallCheck<DB, TM, Keys, Q> & Q,
	): (...params: BoxCallArgs<DB, TM, Keys, Q>) => CallRet<DB, TM, Keys, Q>;
	prepare<const Q extends string, const S extends SlotMap>(
		query: GateSlottedCheck<DB, TM, Q, S> & Q,
		slots: S & SlotsFor<Q, S>,
	): (
		...params: BoxSlottedArgs<DB, TM, Q, S>
	) => Query<
		KeyedRow<RowOf<DB, TM, SplicedOr<Q, S>>, Keys>,
		ParamsOf<DB, TM, SplicedOr<Q, S>>,
		SplicedOr<Q, S>
	>;
	<const Q extends string, const S extends SlotMap>(
		query: GateSlottedCheck<DB, TM, Q, S> & Q,
		slots: S & SlotsFor<Q, S>,
		...params: BoxSlottedArgs<DB, TM, Q, S>
	): Query<
		KeyedRow<RowOf<DB, TM, SplicedOr<Q, S>>, Keys>,
		ParamsOf<DB, TM, SplicedOr<Q, S>>,
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

	param<const T>(value: T): InlineMarker<T>;

	json<const T>(value: T): JsonMarker<T>;

	fragment<const Text extends string, const A extends readonly unknown[]>(
		text: GateFragCheck<Text, false> & Text,
		...params: A & BoxFragArgs<Text>
	): Fragment<PText<Text>, UnknownTuple<FragCount<Text>>, FragCarried<Text, A>>;
	fragment<
		const Text extends string,
		const S extends SlotMap,
		const A extends readonly unknown[],
	>(
		text: GateFragCheck<Text, true> & Text,
		slots: S & SlotsFor<Text, S>,
		...params: A & BoxFragArgs<Text>
	): Fragment<
		SplicedOr<Text, S>,
		readonly unknown[],
		[...FragCarried<Text, A>, ...SpliceCarried<PText<Text>, SlotCarried<S>>]
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

	set<const T extends TableName<DB>, const P extends SetInput<DB, TM, T>>(
		table: T,
		values: NoExtraKeys<P, SetInput<DB, TM, T>>,
	): Fragment<SetRep<P>["text"], readonly unknown[], SetRep<P>["carried"]>;

	values<
		const T extends TableName<DB>,
		const R extends readonly InsertInput<DB, TM, T>[],
	>(
		table: T,
		rows: R & {
			readonly [I in keyof R]: NoExtraKeys<R[I], InsertInput<DB, TM, T>>;
		},
	): Fragment<
		ValuesRep<R[number]>["text"],
		readonly unknown[],
		ValuesRep<R[number]>["carried"]
	>;

	raw(text: string): Fragment<string, [], []>;
}
