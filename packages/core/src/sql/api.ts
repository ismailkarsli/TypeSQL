import type {
	Empty,
	EmptyFragment,
	Optional,
	OptionalInput,
	Truthy,
} from "../empty.js";
import type { EngineTypes } from "../engine/contract.js";
import type {
	InsertInput,
	RelationName,
	SetInput,
	TableName,
} from "../engine/write.js";
import type { SqlError } from "../errors.js";
import type { PluginEncoded, PluginInput, SqlPlugin } from "../plugin.js";
import type { Fragment, Query } from "../query.js";
import type { BoxCallArgs, CallRet, GateCallCheck } from "./call.js";
import type {
	BoolOf,
	BoxFragArgs,
	CombineOf,
	CombineSeparator,
	GateFragCheck,
	LiteralParts,
	PlainFragment,
} from "./fragment.js";
import type { InlineMarker, JsonMarker, ParamInput } from "./inline.js";
import type { Slottable } from "./slots.js";
import type { QuotedIdent } from "./splice.js";
import type { NoExtraKeys, SentRows, SetRep, ValuesRep } from "./write.js";

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
type WriteContext<Kind extends "set" | "values", T> = {
	readonly kind: Kind;
	readonly table: [T] extends [string] ? T : null;
};
type WriteInput<
	Input,
	P extends readonly SqlPlugin[],
	Kind extends "set" | "values",
	T extends string,
> = PluginInput<Input, P, WriteContext<Kind, T>>;
/** `T` is `undefined` for `sql.set(values)` and `sql.values(rows)`, whose context table is `null`. */
type WriteEncoded<
	Input,
	P extends readonly SqlPlugin[],
	Kind extends "set" | "values",
	T extends string | undefined,
> = PluginEncoded<Input, P, WriteContext<Kind, T>>;

// The write helpers' results are written as Fragment<…> so that declaration
// emit can name them from @typesql/core.
type SetText<P> = SetRep<P>["text"];
type SetCarried<P> = SetRep<P>["carried"];
type ValuesText<R> = ValuesRep<R>["text"];
type ValuesCarried<R> = ValuesRep<R>["carried"];

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
	/**
	 * Never matches a call (it takes no arguments), so errors are reported
	 * against the signature above. A second call signature keeps TypeScript
	 * from relating that one with strict generic checks when an interface
	 * extends this one (TransactionalSql extends Sql), which instantiates its
	 * checks on a generic statement too deeply.
	 */
	(): SqlError<"sql() takes a SQL statement", null>;
	prepare<const Q extends string>(
		query: GateCallCheck<E, DB, TM, Q> & Q,
	): (
		...params: Parameters<BoxCallArgs<E, DB, TM, Q>, Plugins>
	) => CallRet<E, DB, TM, Q, Plugins>;

	as<Row>(
		query: string,
		...params: readonly unknown[]
	): Query<Row, readonly unknown[]>;

	/** `undefined` becomes an omission: DEFAULT in sql.param, a skipped item in sql.combine/and/or, nothing as `${…}`. `null` stays SQL `NULL`. */
	optional<const T>(value: T & OptionalInput<T>): Optional<T>;

	/**
	 * `then(value)` when `value` is truthy, and otherwise the omission
	 * `sql.optional(undefined)` gives. Like `sql.optional`, the statement is
	 * checked with and without the fragment.
	 */
	if<V, R extends Slottable>(
		value: V,
		then: (value: Truthy<V>) => R,
	): R | EmptyFragment;

	param<const T>(
		value: T & ParamInput<T>,
	): InlineMarker<
		| Extract<T, Empty>
		| PluginEncoded<Exclude<T, Empty>, Plugins, { readonly kind: "value" }>
	>;

	json<const T>(value: T): JsonMarker<T>;

	fragment<const Text extends string, const A extends readonly unknown[]>(
		text: GateFragCheck<Text> & Text,
		...params: A & Parameters<BoxFragArgs<Text>, Plugins>
	): PlainFragment<Text, EncodedParameters<A, Plugins>>;

	id<const Parts extends readonly [string, ...string[]]>(
		...parts: Parts & LiteralParts<Parts>
	): Fragment<QuotedIdent<Parts>, [], []>;
	id(name: RelationName<DB>): Fragment<QuotedIdent<[RelationName<DB>]>, [], []>;
	id(...parts: readonly [string, ...string[]]): Fragment<string, [], []>;

	combine<
		const Items extends readonly (Slottable | Empty)[],
		const Sep extends CombineSeparator = ", ",
	>(
		items: Items,
		options?: { readonly separator?: Sep },
	): CombineOf<Items, Sep>;

	and<const Items extends readonly (Slottable | Empty)[]>(
		items: Items,
	): BoolOf<Items, "AND">;

	or<const Items extends readonly (Slottable | Empty)[]>(
		items: Items,
	): BoolOf<Items, "OR">;

	set<const T extends TableName<DB>, const P>(
		table: T,
		values: P &
			(P extends WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>
				? NoExtraKeys<P, WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>>
				: never),
	): Fragment<
		SetText<WriteEncoded<P, Plugins, "set", T>>,
		readonly unknown[],
		SetCarried<WriteEncoded<P, Plugins, "set", T>>
	>;
	/** Checked against the table of the `UPDATE` it is interpolated into. */
	set<const P extends object>(
		values: P,
	): Fragment<
		SetText<WriteEncoded<P, Plugins, "set", undefined>>,
		readonly unknown[],
		SetCarried<WriteEncoded<P, Plugins, "set", undefined>>
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
		ValuesText<WriteEncoded<R[number], Plugins, "values", T>>,
		readonly unknown[],
		ValuesCarried<WriteEncoded<R[number], Plugins, "values", T>>
	>;
	/**
	 * Checked against the table of the `INSERT` it is interpolated into: once
	 * with every column, and once with only the columns every row always
	 * sends, so a required column a row can leave out is an error there.
	 */
	values<const R extends readonly object[]>(
		rows: R,
	):
		| Fragment<
				ValuesText<WriteEncoded<R[number], Plugins, "values", undefined>>,
				readonly unknown[],
				ValuesCarried<WriteEncoded<R[number], Plugins, "values", undefined>>
		  >
		| Fragment<
				ValuesText<
					SentRows<WriteEncoded<R[number], Plugins, "values", undefined>>
				>,
				readonly unknown[],
				ValuesCarried<
					SentRows<WriteEncoded<R[number], Plugins, "values", undefined>>
				>
		  >;

	raw(text: string): Fragment<string, [], []>;
}
