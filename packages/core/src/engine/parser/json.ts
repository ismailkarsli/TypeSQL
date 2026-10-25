import type { PgScalarName } from "../../schema/pg-types.js";
import type { IdTok, OpTok, StrTok, Toks, WordTok } from "../lexer/tokens.js";
import type {
	ParseCall,
	ParseExpr,
	ParseFilter,
	ParseOrderList,
	ParseOver,
} from "./expr.js";
import type { ParseSelectStmt } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Ok,
	SkipWord,
	SyntaxErrorAt,
} from "./util.js";

/**
 * SQL/JSON syntax (PostgreSQL 16–18): the constructors `JSON`, `JSON_SCALAR`, `JSON_SERIALIZE`,
 * `JSON_OBJECT`, `JSON_ARRAY`, the aggregates `JSON_OBJECTAGG` / `JSON_ARRAYAGG`, the query
 * functions `JSON_EXISTS` / `JSON_VALUE` / `JSON_QUERY` and `JSON_TABLE` in FROM.
 *
 * The keywords are col-name keywords: never ordinary function names, so a `json_*(` call is
 * always one of these forms (`expr.ts` dispatches here only for a keyword followed by `(`).
 * Nodes (ast.ts):
 *   jsonfn   constructors and query functions; `fn` is Postgres's output column name
 *   jsonagg  JSON_OBJECTAGG / JSON_ARRAYAGG as the `json[b]_[object_]agg[_strict]` call they mean
 *   jsonfmt  `value FORMAT JSON`: a text / bytea value embedded as JSON
 * Options that do not change the result type (ENCODING, WITH UNIQUE KEYS, WRAPPER, QUOTES,
 * ERROR / NULL / EMPTY … ON EMPTY / ON ERROR) are parsed and dropped; DEFAULT expressions are
 * kept for typing and parameters.
 */
export type JsonFuncWord =
	| "json"
	| "json_scalar"
	| "json_serialize"
	| "json_object"
	| "json_array"
	| "json_objectagg"
	| "json_arrayagg"
	| "json_exists"
	| "json_value"
	| "json_query"
	| "json_table";

/** `I0` is the index of the keyword; `(` follows it. */
export type ParseJsonFunc<
	T extends Toks,
	W extends string,
	I0 extends number,
> = W extends "json_value" | "json_query" | "json_exists"
	? ParseQueryFn<T, W, Nx<Nx<I0>>>
	: W extends "json_object"
		? ParseObject<T, Nx<Nx<I0>>>
		: W extends "json_array"
			? ParseArrayCtor<T, Nx<Nx<I0>>>
			: W extends "json_objectagg"
				? ParseObjectAgg<T, Nx<Nx<I0>>>
				: W extends "json_arrayagg"
					? ParseArrayAgg<T, Nx<Nx<I0>>>
					: W extends "json" | "json_scalar" | "json_serialize"
						? ParseUnaryFn<T, W, Nx<Nx<I0>>>
						: // JSON_TABLE is only allowed in FROM
							SyntaxErrorAt<T, Nx<I0>>;

type Fn<
	F extends string,
	Args,
	Ret,
	Absent = false, // type-mutate: equivalent bool-flip – read only for JSON_OBJECT / JSON_ARRAY values, which pass their own
	Passing = [],
	Defaults = [],
	Q = null,
	Unknown = false, // type-mutate: equivalent bool-flip – read only for JSON_EXISTS, which passes its own
> = {
	t: "jsonfn";
	fn: F;
	args: Args;
	passing: Passing;
	defaults: Defaults;
	q: Q;
	ret: Ret;
	absent: Absent;
	unknownOnError: Unknown;
};

type Close<T extends Toks, I extends number, N> =
	EatOp<T, I, ")"> extends never
		? Expected<'")"', T, I>
		: Ok<N, EatOp<T, I, ")">>;

// ───────────────────────────── clauses ─────────────────────────────

/** `FORMAT JSON [ENCODING name]` → next index, or `never` (SkipEncoding keeps a `never`). */
type EatFormat<T extends Toks, I extends number> = SkipEncoding<
	T,
	EatWords<T, I, ["format", "json"]>
>;
type SkipEncoding<T extends Toks, I extends number> =
	T[I] extends WordTok<"encoding">
		? T[Nx<I>] extends WordTok | IdTok
			? Nx<Nx<I>>
			: I
		: I;
type SkipFormat<T extends Toks, I extends number> =
	EatFormat<T, I> extends never ? I : EatFormat<T, I>;

/** `a_expr [FORMAT JSON [ENCODING name]]`: the expression, wrapped in `jsonfmt` when formatted. */
type ParseJsonValue<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatFormat<T, J> extends never
				? X
				: Ok<{ t: "jsonfmt"; e: E }, EatFormat<T, J>>
			: X
		: never;

/** `[RETURNING type [FORMAT JSON [ENCODING name]]]` → `Ok<type | null, next>`. */
type ParseReturning<T extends Toks, I extends number> =
	EatWord<T, I, "returning"> extends never
		? Ok<null, I>
		: ParseTypeName<T, EatWord<T, I, "returning">> extends infer X
			? X extends Ok<infer Ty, infer J>
				? Ok<Ty, SkipFormat<T, J>>
				: X
			: never;

/** `WITH | WITHOUT UNIQUE [KEYS]` (constructors, `IS JSON`) → next index. */
export type SkipUniqueKeys<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? T[Nx<I>] extends WordTok<"unique">
			? SkipWord<T, Nx<Nx<I>>, "keys">
			: I
		: I;

/** `NULL ON NULL | ABSENT ON NULL` → `[absent, next]`. */
type NullClause<T extends Toks, I extends number, Default extends boolean> =
	EatWords<T, I, ["null", "on", "null"]> extends never
		? EatWords<T, I, ["absent", "on", "null"]> extends never
			? [Default, I]
			: [true, EatWords<T, I, ["absent", "on", "null"]>]
		: [false, EatWords<T, I, ["null", "on", "null"]>];

/** `WITHOUT [ARRAY] WRAPPER | WITH [CONDITIONAL | UNCONDITIONAL] [ARRAY] WRAPPER` → next index. */
type SkipWrapper<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? EatWord<
				T,
				SkipWord<
					T,
					SkipWord<T, Nx<I>, "conditional" | "unconditional">,
					"array"
				>,
				"wrapper"
			> extends never
			? I
			: EatWord<
					T,
					SkipWord<
						T,
						SkipWord<T, Nx<I>, "conditional" | "unconditional">,
						"array"
					>,
					"wrapper"
				>
		: I;
/** `KEEP | OMIT QUOTES [ON SCALAR STRING]` → next index. */
type SkipQuotes<T extends Toks, I extends number> =
	T[I] extends WordTok<"keep" | "omit">
		? T[Nx<I>] extends WordTok<"quotes">
			? EatWords<T, Nx<Nx<I>>, ["on", "scalar", "string"]> extends never
				? Nx<Nx<I>>
				: EatWords<T, Nx<Nx<I>>, ["on", "scalar", "string"]>
			: I
		: I;

/** `PASSING value AS name, …` → `Ok<values, next>`. */
type ParsePassing<T extends Toks, I extends number> =
	EatWord<T, I, "passing"> extends never
		? Ok<[], I>
		: ParsePassingList<T, EatWord<T, I, "passing">, []>;
type ParsePassingList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer E, infer J>
			? EatWord<T, J, "as"> extends never
				? Expected<"AS", T, J>
				: AnyLabel<T, EatWord<T, J, "as">> extends [
							string,
							infer J2 extends number,
						]
					? EatOp<T, J2, ","> extends never
						? Ok<[...Acc, E], J2>
						: ParsePassingList<T, EatOp<T, J2, ",">, [...Acc, E]>
					: Expected<"name", T, EatWord<T, J, "as">>
			: X
		: never;

/**
 * One behavior: `DEFAULT expr | ERROR | NULL | TRUE | FALSE | UNKNOWN | EMPTY [ARRAY | OBJECT]`
 * → `Ok<{ k, at }, next>` (`at`: its first token), or `null` when there is none.
 */
type ParseBehavior<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "default"
			? ParseExpr<T, Nx<I>, 0> extends infer X
				? X extends Ok<infer E, infer J>
					? Ok<{ k: "default"; e: E; at: I }, J>
					: X
				: never
			: W extends "error" | "null" | "true" | "false" | "unknown"
				? Ok<{ k: W; at: I }, Nx<I>>
				: W extends "empty"
					? T[Nx<I>] extends WordTok<"object">
						? Ok<{ k: "emptyobj"; at: I }, Nx<Nx<I>>>
						: Ok<{ k: "empty"; at: I }, SkipWord<T, Nx<I>, "array">>
					: null
		: null;

/** The behaviors each context allows (`empty` is EMPTY [ARRAY]). */
type ValueBehavior = "error" | "null" | "default"; // JSON_VALUE, scalar columns
type QueryBehavior = ValueBehavior | "empty" | "emptyobj"; // JSON_QUERY, formatted columns
type ExistsBehavior = "error" | "true" | "false" | "unknown"; // JSON_EXISTS, EXISTS columns
type TableBehavior = "error" | "empty"; // the JSON_TABLE level

/**
 * `[behavior ON EMPTY] [behavior ON ERROR]` → `Ok<[onEmpty | null, onError | null], next>`.
 * `Empty` false: only `ON ERROR` is allowed (JSON_EXISTS, EXISTS columns, the JSON_TABLE level).
 * Each behavior must be one of `Allowed`; `Of` names the column in the message.
 */
type ParseBehaviors<
	T extends Toks,
	I extends number,
	Empty extends boolean,
	Allowed extends string,
	Of extends string,
> =
	ParseBehavior<T, I> extends infer B
		? B extends Ok<infer B1, infer J>
			? EatWords<T, J, ["on", "error"]> extends never
				? EatWords<T, J, ["on", "empty"]> extends never
					? Expected<
							Empty extends true ? "ON EMPTY or ON ERROR" : "ON ERROR",
							T,
							J
						>
					: Empty extends false
						? SyntaxErrorAt<T, Nx<J>>
						: ParseOnError<T, EatWords<T, J, ["on", "empty"]>, B1, Allowed, Of>
				: CheckBehaviors<
						[null, B1],
						EatWords<T, J, ["on", "error"]>,
						Allowed,
						Of
					>
			: B extends null
				? Ok<[null, null], I>
				: B
		: never;
type ParseOnError<
	T extends Toks,
	I extends number,
	OnEmpty,
	Allowed extends string,
	Of extends string,
> =
	ParseBehavior<T, I> extends infer B
		? B extends Ok<infer B2, infer J>
			? EatWords<T, J, ["on", "error"]> extends never
				? Expected<"ON ERROR", T, J>
				: CheckBehaviors<
						[OnEmpty, B2],
						EatWords<T, J, ["on", "error"]>,
						Allowed,
						Of
					>
			: B extends null
				? CheckBehaviors<[OnEmpty, null], I, Allowed, Of>
				: B
		: never;

/**
 * Postgres checks the kinds first (ON EMPTY, then ON ERROR), then that each DEFAULT is a
 * constant, function or operator expression (not a parameter, column or subquery).
 */
type CheckBehaviors<
	Bs extends readonly [unknown, unknown],
	J extends number,
	Allowed extends string,
	Of extends string,
> = CheckKind<
	Bs[0],
	Allowed,
	`invalid ON EMPTY behavior${Of}`,
	CheckKind<
		Bs[1],
		Allowed,
		`invalid ON ERROR behavior${Of}`,
		CheckDefault<Bs[0], CheckDefault<Bs[1], Ok<Bs, J>>>
	>
>;
type CheckKind<
	B,
	Allowed extends string,
	Message extends string,
	R,
> = B extends {
	k: infer K;
	at: infer At extends number;
}
	? K extends Allowed
		? R
		: Fail<Message, At>
	: R;
/** A DEFAULT Postgres rejects: a bare parameter (cast or not), column or subquery. */
type NotDefault =
	| { readonly t: "param" | "col" | "sub" }
	| { readonly t: "cast"; readonly e: { readonly t: "param" } };
type CheckDefault<B, R> = B extends {
	k: "default";
	e: NotDefault;
	at: infer At extends number;
}
	? Fail<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			Nx<At>
		>
	: R;

/** DEFAULT expressions of a behavior pair. */
type DefaultsOf<Bs extends readonly [unknown, unknown]> = [
	...DefaultOf<Bs[0]>,
	...DefaultOf<Bs[1]>,
];
type DefaultOf<B> = B extends { k: "default"; e: infer E } ? [E] : [];

// ───────────────────────────── JSON(), JSON_SCALAR(), JSON_SERIALIZE() ─────────────────────────────

type ParseUnaryFn<
	T extends Toks,
	W extends string,
	I extends number,
> = W extends "json_scalar"
	? ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? Close<T, J, Fn<W, [E], null>>
			: X
		: never
	: ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer E, infer J>
			? W extends "json"
				? Close<T, SkipUniqueKeys<T, J>, Fn<W, [E], null>>
				: ParseReturning<T, J> extends infer R
					? R extends Ok<infer Ret, infer J2>
						? Close<T, J2, Fn<W, [E], Ret>>
						: R
					: never
			: X
		: never;

// ───────────────────────────── JSON_OBJECT ─────────────────────────────

/** After `JSON_OBJECT(`: `key : value | key VALUE value, …` with options, only options, or a plain `json_object(text[] …)` call. */
type ParseObject<T extends Toks, I extends number> =
	T[I] extends OpTok<")">
		? Ok<Fn<"json_object", [], null>, Nx<I>>
		: T[I] extends WordTok<"returning">
			? ObjectOptions<T, I, []>
			: ParseExpr<T, I, 0> extends infer X
				? X extends Ok<infer K, infer J>
					? T[J] extends OpTok<":"> | WordTok<"value">
						? ParsePairValue<T, [K], Nx<J>>
						: ParseCall<T, "json_object", I>
					: X
				: never;
/** At a key. */
type ParsePairs<
	T extends Toks,
	Acc extends readonly unknown[],
	I extends number,
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer K, infer J>
			? T[J] extends OpTok<":"> | WordTok<"value">
				? ParsePairValue<T, [...Acc, K], Nx<J>>
				: Expected<'":" or VALUE', T, J>
			: X
		: never;
/** At a value. */
type ParsePairValue<
	T extends Toks,
	Acc extends readonly unknown[],
	I extends number,
> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer V, infer J>
			? EatOp<T, J, ","> extends never
				? ObjectOptions<T, J, [...Acc, V]>
				: ParsePairs<T, [...Acc, V], EatOp<T, J, ",">>
			: X
		: never;
/** `[NULL | ABSENT ON NULL] [WITH | WITHOUT UNIQUE [KEYS]] [RETURNING …] )` */
type ObjectOptions<T extends Toks, I extends number, Args> =
	NullClause<T, I, false> extends [infer Absent, infer I1 extends number]
		? ParseReturning<T, SkipUniqueKeys<T, I1>> extends infer R
			? R extends Ok<infer Ret, infer J>
				? Close<T, J, Fn<"json_object", Args, Ret, Absent>>
				: R
			: never
		: never;

// ───────────────────────────── JSON_ARRAY ─────────────────────────────

/** After `JSON_ARRAY(`: values, a query, or only options. Arrays skip NULLs unless `NULL ON NULL`. */
type ParseArrayCtor<T extends Toks, I extends number> =
	T[I] extends OpTok<")">
		? Ok<Fn<"json_array", [], null>, Nx<I>>
		: T[I] extends WordTok<"returning">
			? ArrayOptions<T, I, []>
			: T[I] extends WordTok<"select" | "with" | "values" | "table">
				? ParseSelectStmt<T, I> extends infer X
					? X extends Ok<infer S, infer J>
						? ParseReturning<T, SkipFormat<T, J>> extends infer R
							? R extends Ok<infer Ret, infer J2>
								? Close<
										T,
										J2,
										Fn<
											"json_array",
											[],
											Ret,
											true, // type-mutate: equivalent bool-flip – JSON_ARRAY(query) skips NULLs itself; absent is not read
											[],
											[],
											S
										>
									>
								: R
							: never
						: X
					: never
				: ParseArrayValues<T, I, []>;
type ParseArrayValues<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer V, infer J>
			? EatOp<T, J, ","> extends never
				? ArrayOptions<T, J, [...Acc, V]>
				: ParseArrayValues<T, EatOp<T, J, ",">, [...Acc, V]>
			: X
		: never;
type ArrayOptions<T extends Toks, I extends number, Args> =
	NullClause<T, I, true> extends [infer Absent, infer I1 extends number]
		? ParseReturning<T, I1> extends infer R
			? R extends Ok<infer Ret, infer J>
				? Close<T, J, Fn<"json_array", Args, Ret, Absent>>
				: R
			: never
		: never;

// ───────────────────────────── aggregates ─────────────────────────────

/** `JSON_OBJECTAGG(key : value [NULL | ABSENT ON NULL] [WITH | WITHOUT UNIQUE [KEYS]] [RETURNING …]) [FILTER …] [OVER …]` */
type ParseObjectAgg<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer K, infer J>
			? T[J] extends OpTok<":"> | WordTok<"value">
				? ParseJsonValue<T, Nx<J>> extends infer Y
					? Y extends Ok<infer V, infer J2>
						? NullClause<T, J2, false> extends [
								infer Absent,
								infer J3 extends number,
							]
							? ParseReturning<T, SkipUniqueKeys<T, J3>> extends infer R
								? R extends Ok<infer Ret, infer J4>
									? EatOp<T, J4, ")"> extends never
										? Expected<'")"', T, J4>
										: AggSuffix<
												T,
												"json_objectagg",
												`${AggBase<Ret>}_object_agg${Absent extends true ? "_strict" : ""}`,
												[K, V],
												Ret,
												EatOp<T, J4, ")">
											>
									: R
								: never
							: never
						: Y
					: never
				: Expected<'":" or VALUE', T, J>
			: X
		: never;

/** `JSON_ARRAYAGG(value [ORDER BY …] [NULL | ABSENT ON NULL] [RETURNING …]) [FILTER …] [OVER …]`; NULLs are skipped by default. */
type ParseArrayAgg<T extends Toks, I extends number> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer V, infer J>
			? SkipOrderBy<T, J> extends infer J1
				? J1 extends number
					? NullClause<T, J1, true> extends [
							infer Absent,
							infer J2 extends number,
						]
						? ParseReturning<T, J2> extends infer R
							? R extends Ok<infer Ret, infer J3>
								? EatOp<T, J3, ")"> extends never
									? Expected<'")"', T, J3>
									: AggSuffix<
											T,
											"json_arrayagg",
											`${AggBase<Ret>}_agg${Absent extends true ? "_strict" : ""}`,
											[V],
											Ret,
											EatOp<T, J3, ")">
										>
								: R
							: never
						: never
					: J1
				: never
			: X
		: never;
type SkipOrderBy<T extends Toks, I extends number> =
	EatWords<T, I, ["order", "by"]> extends never
		? I
		: ParseOrderList<T, EatWords<T, I, ["order", "by"]>> extends infer X
			? X extends Ok<unknown, infer J>
				? J
				: X
			: never;
/** The aggregate behind the syntax: `jsonb_…` for `RETURNING jsonb`, else `json_…` (other RETURNING types are casts of it). */
type AggBase<Ret> = Ret extends "jsonb" ? "jsonb" : "json";
type AggSuffix<
	T extends Toks,
	F extends string,
	Name extends string,
	Args,
	Ret,
	I extends number,
> =
	ParseFilter<T, I> extends infer X
		? X extends Ok<infer Flt, infer I1>
			? ParseOver<T, I1> extends infer O
				? O extends Ok<infer Ov, infer I2>
					? Ok<
							{
								t: "jsonagg";
								fn: F;
								ret: Ret;
								e: {
									t: "call";
									name: Name;
									args: Args;
									distinct: false;
									filter: Flt;
									over: Ov extends null ? false : true; // type-mutate: equivalent never-false – read with `extends true`, where never counts as true
									win: Ov;
									withinGroup: null;
								};
							},
							I2
						>
					: O
				: never
			: X
		: never;

// ───────────────────────────── JSON_EXISTS, JSON_VALUE, JSON_QUERY ─────────────────────────────

/** After `(`: `context [FORMAT JSON], path [PASSING …]` and the function's options. */
type ParseQueryFn<T extends Toks, W extends string, I extends number> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer Cx, infer J>
			? EatOp<T, J, ","> extends never
				? Expected<'","', T, J>
				: ParseExpr<T, EatOp<T, J, ",">, 0> extends infer Y
					? Y extends Ok<infer Path, infer J2>
						? ParsePassing<T, J2> extends infer P
							? P extends Ok<infer Passing, infer J3>
								? W extends "json_exists"
									? QueryTail<T, W, [Cx, Path], Passing, null, J3>
									: ParseReturning<T, J3> extends infer R
										? R extends Ok<infer Ret, infer J4>
											? QueryTail<
													T,
													W,
													[Cx, Path],
													Passing,
													Ret,
													W extends "json_query"
														? SkipQuotes<T, SkipWrapper<T, J4>>
														: J4
												>
											: R
										: never
								: P
							: never
						: Y
					: never
			: X
		: never;
type QueryTail<
	T extends Toks,
	W extends string,
	Args,
	Passing,
	Ret,
	I extends number,
> =
	ParseBehaviors<
		T,
		I,
		W extends "json_exists" ? false : true,
		W extends "json_exists"
			? ExistsBehavior
			: W extends "json_value"
				? ValueBehavior
				: QueryBehavior,
		""
	> extends infer B
		? B extends Ok<infer Bs extends readonly [unknown, unknown], infer J>
			? Close<
					T,
					J,
					Fn<
						W,
						Args,
						Ret,
						false, // type-mutate: equivalent bool-flip – absent is read only for JSON_OBJECT / JSON_ARRAY
						Passing,
						DefaultsOf<Bs>,
						null,
						Bs[1] extends { k: "unknown" } ? true : false // type-mutate: equivalent never-true – read through Or, where never counts as true
					>
				>
			: B
		: never;

// ───────────────────────────── JSON_TABLE ─────────────────────────────

/**
 * After `JSON_TABLE(`, in FROM: `context, path [AS name] [PASSING …] COLUMNS (…) [behavior ON ERROR] )`
 * → `Ok<{ ctx, path, passing, cols, names, defs }, next>`.
 *
 * `cols` are the output columns in Postgres's order (a level's own columns, then its NESTED
 * paths' columns, depth first), each `{ n, t: { type, nullable } }`: the declared type, nullable
 * (no item, or a sibling NESTED path's row), except a top-level FOR ORDINALITY column (int4).
 * `names` lists the column and path names in declaration order (they must be distinct);
 * `defs` the DEFAULT expressions.
 */
export type ParseJsonTable<T extends Toks, I extends number> =
	ParseJsonValue<T, I> extends infer X
		? X extends Ok<infer Cx, infer J>
			? EatOp<T, J, ","> extends never
				? Expected<'","', T, J>
				: ParseExpr<T, EatOp<T, J, ",">, 0> extends infer Y
					? Y extends Ok<infer Path, infer J2>
						? PathName<T, J2> extends [
								infer Names extends readonly string[],
								infer J3 extends number,
							]
							? ParsePassing<T, J3> extends infer P
								? P extends Ok<infer Passing, infer J4>
									? EatWord<T, J4, "columns"> extends never
										? Expected<"COLUMNS", T, J4>
										: EatOp<T, EatWord<T, J4, "columns">, "("> extends never
											? Expected<'"("', T, EatWord<T, J4, "columns">>
											: ParseColumns<
														T,
														EatOp<T, EatWord<T, J4, "columns">, "(">,
														true,
														[],
														[],
														Names,
														[],
														false
													> extends infer Cs
												? Cs extends Ok<
														infer Body extends {
															cols: unknown;
															names: unknown;
															defs: unknown;
														},
														infer J5
													>
													? ParseBehaviors<
															T,
															J5,
															false,
															TableBehavior,
															""
														> extends infer B
														? B extends Ok<unknown, infer J6>
															? Close<
																	T,
																	J6,
																	{
																		ctx: Cx;
																		path: Path;
																		passing: Passing;
																		cols: Body["cols"];
																		names: Body["names"];
																		defs: Body["defs"];
																	}
																>
															: B
														: never
													: Cs
												: never
									: P
								: never
							: never
						: Y
					: never
			: X
		: never;
/** `[AS name]` after a path → `[names, next]`. */
type PathName<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? Ident<T, Nx<I>> extends [infer N, infer J]
			? [[N], J]
			: [[], I]
		: [[], I];

/**
 * Column definitions up to `)`. `Own`: this level's columns; `Nest`: its nested paths' columns;
 * `Ord`: a FOR ORDINALITY column was seen at this level (only one is allowed).
 */
type ParseColumns<
	T extends Toks,
	I extends number,
	Top extends boolean,
	Own extends readonly unknown[],
	Nest extends readonly unknown[],
	Names extends readonly unknown[],
	Defs extends readonly unknown[],
	Ord extends boolean,
> =
	T[I] extends WordTok<"nested">
		? T[Nx<I>] extends WordTok<"path"> | StrTok
			? ParseNested<
					T,
					SkipWord<T, Nx<I>, "path">,
					Top,
					Own,
					Nest,
					Names,
					Defs,
					Ord
				>
			: ParseColumn<T, I, Top, Own, Nest, Names, Defs, Ord>
		: ParseColumn<T, I, Top, Own, Nest, Names, Defs, Ord>;
/** After a column: `,` and the next one, or `)`. */
type ColumnsNext<
	T extends Toks,
	I extends number,
	Top extends boolean,
	Own extends readonly unknown[],
	Nest extends readonly unknown[],
	Names extends readonly unknown[],
	Defs extends readonly unknown[],
	Ord extends boolean,
> =
	EatOp<T, I, ","> extends never
		? EatOp<T, I, ")"> extends never
			? Expected<'"," or ")"', T, I>
			: Ok<
					{ cols: [...Own, ...Nest]; names: Names; defs: Defs },
					EatOp<T, I, ")">
				>
		: ParseColumns<T, EatOp<T, I, ",">, Top, Own, Nest, Names, Defs, Ord>;

type ParseColumn<
	T extends Toks,
	I extends number,
	Top extends boolean,
	Own extends readonly unknown[],
	Nest extends readonly unknown[],
	Names extends readonly unknown[],
	Defs extends readonly unknown[],
	Ord extends boolean,
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatWords<T, J, ["for", "ordinality"]> extends never
			? ParseTypeName<T, J> extends infer X
				? X extends Ok<infer Ty extends string, infer J2>
					? T[J2] extends WordTok<"exists">
						? // name type EXISTS [PATH '…'] [behavior ON ERROR] (never a DEFAULT)
							ParsePathOpt<T, Nx<J2>> extends infer P
							? P extends number
								? ParseBehaviors<
										T,
										P,
										false,
										ExistsBehavior,
										` for column "${N}"`
									> extends infer B
									? B extends Ok<unknown, infer J3>
										? ColumnsNext<
												T,
												J3,
												Top,
												[...Own, Col<N, Ty, true>],
												Nest,
												[...Names, N],
												Defs,
												Ord
											>
										: B
									: never
								: P
							: never
						: // name type [FORMAT JSON] [PATH '…'] [wrapper] [quotes] [behaviors]
							ParsePathOpt<T, SkipFormat<T, J2>> extends infer P
							? P extends number
								? ParseBehaviors<
										T,
										SkipQuotes<T, SkipWrapper<T, P>>,
										true,
										ColumnBehavior<
											Ty,
											[
												SkipFormat<T, J2>,
												SkipQuotes<T, SkipWrapper<T, P>>,
											] extends [J2, P]
												? false
												: true
										>,
										` for column "${N}"`
									> extends infer B
									? B extends Ok<
											infer Bs extends readonly [unknown, unknown],
											infer J3
										>
										? ColumnsNext<
												T,
												J3,
												Top,
												[...Own, Col<N, Ty, true>],
												Nest,
												[...Names, N],
												[...Defs, ...DefaultsOf<Bs>],
												Ord
											>
										: B
									: never
								: P
							: never
					: X
				: never
			: Ord extends true
				? Fail<"only one FOR ORDINALITY column is allowed", I>
				: ColumnsNext<
						T,
						EatWords<T, J, ["for", "ordinality"]>,
						Top,
						[...Own, Col<N, "int4", Top extends true ? false : true>], // type-mutate: equivalent never-false – a never nullability is read with `extends true`, as nullable
						Nest,
						[...Names, N],
						Defs,
						true
					>
		: Expected<"column definition", T, I>;
type Col<N extends string, Ty extends string, Nullable extends boolean> = {
	n: N;
	t: { type: Ty; nullable: Nullable };
};
/**
 * Behaviors of a regular column: a formatted one (FORMAT JSON, a wrapper or quotes clause, or a
 * type other than a built-in scalar) is read like JSON_QUERY, a scalar one like JSON_VALUE.
 * Enums and domains count as formatted here: their columns accept JSON_QUERY's behaviors.
 */
type ColumnBehavior<
	Ty extends string,
	Formatted extends boolean,
> = Formatted extends true
	? QueryBehavior
	: Ty extends ScalarType
		? ValueBehavior
		: QueryBehavior;
type ScalarType = Exclude<
	PgScalarName,
	"json" | "jsonb" | "record" | "void" | "unknown" | `any${string}`
>;
/** `[PATH 'string']` → next index or error. */
type ParsePathOpt<T extends Toks, I extends number> =
	EatWord<T, I, "path"> extends never
		? I
		: T[EatWord<T, I, "path">] extends StrTok
			? Nx<EatWord<T, I, "path">>
			: Expected<"path string", T, EatWord<T, I, "path">>;

/** After `NESTED [PATH]`: `'path' [AS name] COLUMNS (…)`. */
type ParseNested<
	T extends Toks,
	I extends number,
	Top extends boolean,
	Own extends readonly unknown[],
	Nest extends readonly unknown[],
	Names extends readonly unknown[],
	Defs extends readonly unknown[],
	Ord extends boolean,
> = T[I] extends StrTok
	? PathName<T, Nx<I>> extends [
			infer PN extends readonly string[],
			infer J extends number,
		]
		? EatWord<T, J, "columns"> extends never
			? Expected<"COLUMNS", T, J>
			: EatOp<T, EatWord<T, J, "columns">, "("> extends never
				? Expected<'"("', T, EatWord<T, J, "columns">>
				: ParseColumns<
							T,
							EatOp<T, EatWord<T, J, "columns">, "(">,
							false,
							[],
							[],
							[...Names, ...PN],
							Defs,
							false
						> extends infer X
					? X extends Ok<
							{
								cols: infer Cs extends readonly unknown[];
								names: infer Ns extends readonly unknown[];
								defs: infer Ds extends readonly unknown[];
							},
							infer J2
						>
						? ColumnsNext<T, J2, Top, Own, [...Nest, ...Cs], Ns, Ds, Ord>
						: X
					: never
		: never
	: Expected<"path string", T, I>;
