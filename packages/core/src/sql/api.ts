import type { Empty } from "../empty.js";
import type { SqlError } from "../errors.js";
import type { PluginEncoded, PluginInput, SqlPlugin } from "../plugin.js";
import type { Fragment, InlineFragment, Query } from "../query.js";
import type { RelationName, TableName } from "../schema.js";
import type { BoxCallArgs, CallRet, GateCallCheck } from "./call.js";
import type { EngineTypes } from "./contract.js";
import type {
	BoolOf,
	BoxFragArgs,
	CombineOf,
	CombineSeparator,
	GateFragCheck,
	LiteralParts,
	PlainFragment,
} from "./fragment.js";
import type {
	InlineMarker,
	JsonInput,
	JsonMarker,
	ParamInput,
} from "./inline.js";
import type { Slottable } from "./slots.js";
import type { QuotedIdent } from "./splice.js";
import type {
	InsertInput,
	NoExtraKeys,
	SameColumns,
	SentRows,
	SetInput,
	SetRep,
	ValuesRep,
} from "./write.js";

/**
 * The omission of an optional fragment or query, which splices nothing as
 * `${…}`. Only it carries the string brand a template keeps: a branded
 * omission next to a `string` value (`x ?? omission`, `flag ? omission : x`)
 * would be reduced away with the DEFAULT it stands for.
 */
export type EmptyFragment = Empty & InlineFragment;

/**
 * `undefined` becomes the omission and `null` stays SQL `NULL`, as in
 * sql.set, sql.values and sql.json.
 */
export type Optional<T> =
	| Exclude<T, undefined>
	| ([Extract<T, undefined>] extends [never]
			? never
			: [Exclude<T, undefined | null>] extends [never]
				? Empty
				: [Exclude<T, undefined | null>] extends [Slottable]
					? EmptyFragment
					: Empty);

/** A `null` fragment would splice the text `null`, so it is an error. */
type OptionalInput<T> = [Extract<T, null>] extends [never]
	? unknown
	: [Exclude<T, undefined | null>] extends [never]
		? unknown
		: [Exclude<T, undefined | null>] extends [Slottable]
			? SqlError<
					"use undefined, not null, to omit a fragment or query with sql.optional()",
					null
				>
			: unknown;

/** What `sql.if(value, then)` hands `then`: `value` without its falsy members. */
type Truthy<V> = Exclude<V, null | undefined | false | 0 | 0n | "">;

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
type SetText<P, E extends EngineTypes> = SetRep<P, E["quote"]>["text"];
type SetCarried<P, E extends EngineTypes> = SetRep<P, E["quote"]>["carried"];
type ValuesText<R, E extends EngineTypes> = ValuesRep<
	R,
	E["quote"],
	E["emptyRow"]
>["text"];
type ValuesCarried<R, E extends EngineTypes> = ValuesRep<
	R,
	E["quote"],
	E["emptyRow"]
>["carried"];
export interface SqlApi<
	E extends EngineTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
> {
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

	json<const T>(value: T & JsonInput<T>): JsonMarker<T>;

	fragment<const Text extends string, const A extends readonly unknown[]>(
		text: GateFragCheck<Text, E["lexis"]> & Text,
		...params: A & Parameters<BoxFragArgs<Text, E["lexis"]>, Plugins>
	): PlainFragment<Text, EncodedParameters<A, Plugins>, E["lexis"]>;

	id<const Parts extends readonly [string, ...string[]]>(
		...parts: Parts & LiteralParts<Parts>
	): Fragment<QuotedIdent<Parts, E["quote"]>, [], []>;
	id(
		name: RelationName<DB>,
	): Fragment<QuotedIdent<[RelationName<DB>], E["quote"]>, [], []>;
	id(...parts: readonly [string, ...string[]]): Fragment<string, [], []>;

	combine<
		const Items extends readonly (Slottable | Empty)[],
		const Sep extends CombineSeparator = ", ",
	>(
		items: Items,
		options?: { readonly separator?: Sep },
	): CombineOf<Items, Sep, E["lexis"]>;

	and<const Items extends readonly (Slottable | Empty)[]>(
		items: Items,
	): BoolOf<Items, "AND", E["lexis"]>;

	or<const Items extends readonly (Slottable | Empty)[]>(
		items: Items,
	): BoolOf<Items, "OR", E["lexis"]>;

	set<const T extends TableName<DB>, const P>(
		table: T,
		values: P &
			(P extends WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>
				? NoExtraKeys<P, WriteInput<SetInput<E, DB, TM, T>, Plugins, "set", T>>
				: never),
	): Fragment<
		SetText<WriteEncoded<P, Plugins, "set", T>, E>,
		readonly unknown[],
		SetCarried<WriteEncoded<P, Plugins, "set", T>, E>
	>;
	/** Checked against the table of the `UPDATE` it is interpolated into. */
	set<const P extends object>(
		values: P,
	): Fragment<
		SetText<WriteEncoded<P, Plugins, "set", undefined>, E>,
		readonly unknown[],
		SetCarried<WriteEncoded<P, Plugins, "set", undefined>, E>
	>;

	/**
	 * Checked against the table of the `INSERT` it is interpolated into: once
	 * with every column, and once with only the columns every row always
	 * sends, so a required column a row can leave out is an error there.
	 * Declared first: a call that fails is reported, and typed, as this one.
	 */
	values<const R extends readonly object[]>(
		rows: R & SameColumns<E, R>,
	):
		| Fragment<
				ValuesText<WriteEncoded<R[number], Plugins, "values", undefined>, E>,
				readonly unknown[],
				ValuesCarried<WriteEncoded<R[number], Plugins, "values", undefined>, E>
		  >
		| Fragment<
				ValuesText<
					SentRows<WriteEncoded<R[number], Plugins, "values", undefined>>,
					E
				>,
				readonly unknown[],
				ValuesCarried<
					SentRows<WriteEncoded<R[number], Plugins, "values", undefined>>,
					E
				>
		  >;
	values<const T extends TableName<DB>, const R extends readonly unknown[]>(
		table: T,
		rows: R &
			SameColumns<E, R> & {
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
		ValuesText<WriteEncoded<R[number], Plugins, "values", T>, E>,
		readonly unknown[],
		ValuesCarried<WriteEncoded<R[number], Plugins, "values", T>, E>
	>;

	raw(text: string): Fragment<string, [], []>;
}
