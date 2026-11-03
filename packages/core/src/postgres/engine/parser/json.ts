import type {
	IdTok,
	OpTok,
	StrTok,
	Toks,
	WordTok,
} from "../../../engine/tokens.js";
import type { PgScalarName } from "../../schema/pg-types.js";
import type { Tag } from "../ast.js";
import type {
	CallNode,
	ParseCall,
	ParseExpr,
	ParseFilter,
	ParseOver,
	SkipAggOrderBy,
} from "./expr.js";
import type { ParseSelectStmt } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	Close,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Nx2,
	Nx3,
	Ok,
	SkipWord,
	SyntaxErrorAt,
} from "./util.js";

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

export type ParseJsonFunc<
	T extends Toks,
	W extends string,
	I0 extends number,
> = W extends "json_value" | "json_query" | "json_exists"
	? ParseQueryFn<T, W, Nx2<I0>>
	: W extends "json_object"
		? ParseObject<T, Nx2<I0>>
		: W extends "json_array"
			? ParseArrayCtor<T, Nx2<I0>>
			: W extends "json_objectagg"
				? ParseObjectAgg<T, Nx2<I0>>
				: W extends "json_arrayagg"
					? ParseArrayAgg<T, Nx2<I0>>
					: W extends "json" | "json_scalar" | "json_serialize"
						? ParseUnaryFn<T, W, Nx2<I0>>
						: SyntaxErrorAt<T, Nx<I0>>;

type Fn<
	F extends string,
	Args,
	Ret,
	Absent = false,
	Passing = [],
	Defaults = [],
	Q = null,
	Unknown = false,
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

type EatFormat<T extends Toks, I extends number> = SkipEncoding<
	T,
	EatWords<T, I, ["format", "json"]>
>;
type SkipEncoding<T extends Toks, I extends number> =
	T[I] extends WordTok<"encoding">
		? T[Nx<I>] extends WordTok | IdTok
			? Nx2<I>
			: I
		: I;
type SkipFormat<T extends Toks, I extends number> =
	EatFormat<T, I> extends never ? I : EatFormat<T, I>;

type ParseJsonValue<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatFormat<T, J> extends never
				? X
				: Ok<{ t: "jsonfmt"; e: E }, EatFormat<T, J>>
			: X
		: never;

type ParseReturning<T extends Toks, I extends number> =
	EatWord<T, I, "returning"> extends never
		? Ok<null, I>
		: ParseTypeName<T, Nx<I>> extends Ok<infer Ty, infer J>
			? Ok<Ty, SkipFormat<T, J>>
			: ParseTypeName<T, Nx<I>>;

export type SkipUniqueKeys<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? T[Nx<I>] extends WordTok<"unique">
			? SkipWord<T, Nx2<I>, "keys">
			: I
		: I;

type NullClause<T extends Toks, I extends number, Default extends boolean> =
	EatWords<T, I, ["null", "on", "null"]> extends never
		? EatWords<T, I, ["absent", "on", "null"]> extends never
			? [Default, I]
			: [true, Nx3<I>]
		: [false, Nx3<I>];

type SkipWrapper<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? SkipWord<
				T,
				SkipWord<T, Nx<I>, "conditional" | "unconditional">,
				"array"
			> extends infer J extends number
			? T[J] extends WordTok<"wrapper">
				? Nx<J>
				: I
			: never
		: I;
type SkipQuotes<T extends Toks, I extends number> =
	T[I] extends WordTok<"keep" | "omit">
		? T[Nx<I>] extends WordTok<"quotes">
			? EatWords<T, Nx2<I>, ["on", "scalar", "string"]> extends never
				? Nx2<I>
				: Nx3<Nx2<I>>
			: I
		: I;

type ParsePassing<T extends Toks, I extends number> =
	EatWord<T, I, "passing"> extends never
		? Ok<[], I>
		: ParsePassingList<T, Nx<I>, []>;
type ParsePassingList<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseJsonValue<T, I> extends Ok<infer E, infer J>
		? EatWord<T, J, "as"> extends never
			? Expected<"AS", T, J>
			: AnyLabel<T, Nx<J>> extends [string, infer J2 extends number]
				? EatOp<T, J2, ","> extends never
					? Ok<[...Acc, E], J2>
					: ParsePassingList<T, Nx<J2>, [...Acc, E]>
				: Expected<"name", T, Nx<J>>
		: ParseJsonValue<T, I>;

type ParseBehavior<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "default"
			? ParseExpr<T, Nx<I>, 0> extends Ok<infer E, infer J>
				? Ok<{ k: "default"; e: E; at: I }, J>
				: ParseExpr<T, Nx<I>, 0>
			: W extends "error" | "null" | "true" | "false" | "unknown"
				? Ok<{ k: W; at: I }, Nx<I>>
				: W extends "empty"
					? T[Nx<I>] extends WordTok<"object">
						? Ok<{ k: "emptyobj"; at: I }, Nx2<I>>
						: Ok<{ k: "empty"; at: I }, SkipWord<T, Nx<I>, "array">>
					: null
		: null;

type ValueBehavior = "error" | "null" | "default";
type QueryBehavior = ValueBehavior | "empty" | "emptyobj";
type ExistsBehavior = "error" | "true" | "false" | "unknown";
type TableBehavior = "error" | "empty";

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
						: ParseOnError<T, Nx2<J>, B1, Allowed, Of>
				: CheckBehaviors<[null, B1], Nx2<J>, Allowed, Of>
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
				: CheckBehaviors<[OnEmpty, B2], Nx2<J>, Allowed, Of>
			: B extends null
				? CheckBehaviors<[OnEmpty, null], I, Allowed, Of>
				: B
		: never;

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
type NotDefault =
	| Tag<"param" | "col" | "sub">
	| { readonly t: "cast"; readonly e: Tag<"param"> };
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

type DefaultsOf<Bs extends readonly [unknown, unknown]> = [
	...DefaultOf<Bs[0]>,
	...DefaultOf<Bs[1]>,
];
type DefaultOf<B> = B extends { k: "default"; e: infer E } ? [E] : [];

type ParseUnaryFn<
	T extends Toks,
	W extends string,
	I extends number,
> = W extends "json_scalar"
	? ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? Close<T, J, Fn<W, [E], null>>
		: ParseExpr<T, I, 0>
	: ParseJsonValue<T, I> extends Ok<infer E, infer J>
		? W extends "json"
			? Close<T, SkipUniqueKeys<T, J>, Fn<W, [E], null>>
			: ParseReturning<T, J> extends Ok<infer Ret, infer J2>
				? Close<T, J2, Fn<W, [E], Ret>>
				: ParseReturning<T, J>
		: ParseJsonValue<T, I>;

type ParseObject<T extends Toks, I extends number> =
	T[I] extends OpTok<")">
		? Ok<Fn<"json_object", [], null>, Nx<I>>
		: T[I] extends WordTok<"returning">
			? CtorOptions<T, I, "json_object", []>
			: ParseExpr<T, I, 0> extends Ok<infer K, infer J>
				? T[J] extends OpTok<":"> | WordTok<"value">
					? ParsePairValue<T, [K], Nx<J>>
					: ParseCall<T, "json_object", I>
				: ParseExpr<T, I, 0>;
type ParsePairs<
	T extends Toks,
	Acc extends readonly unknown[],
	I extends number,
> =
	ParseExpr<T, I, 0> extends Ok<infer K, infer J>
		? T[J] extends OpTok<":"> | WordTok<"value">
			? ParsePairValue<T, [...Acc, K], Nx<J>>
			: Expected<'":" or VALUE', T, J>
		: ParseExpr<T, I, 0>;
type ParsePairValue<
	T extends Toks,
	Acc extends readonly unknown[],
	I extends number,
> =
	ParseJsonValue<T, I> extends Ok<infer V, infer J>
		? EatOp<T, J, ","> extends never
			? CtorOptions<T, J, "json_object", [...Acc, V]>
			: ParsePairs<T, [...Acc, V], Nx<J>>
		: ParseJsonValue<T, I>;
type CtorOptions<
	T extends Toks,
	I extends number,
	W extends "json_object" | "json_array",
	Args,
> =
	NullClause<T, I, W extends "json_array" ? true : false> extends [
		infer Absent,
		infer I1 extends number,
	]
		? ParseReturning<
				T,
				W extends "json_object" ? SkipUniqueKeys<T, I1> : I1
			> extends Ok<infer Ret, infer J>
			? Close<T, J, Fn<W, Args, Ret, Absent>>
			: ParseReturning<T, W extends "json_object" ? SkipUniqueKeys<T, I1> : I1>
		: never;

type ParseArrayCtor<T extends Toks, I extends number> =
	T[I] extends OpTok<")">
		? Ok<Fn<"json_array", [], null>, Nx<I>>
		: T[I] extends WordTok<"returning">
			? CtorOptions<T, I, "json_array", []>
			: T[I] extends WordTok<"select" | "with" | "values" | "table">
				? ParseSelectStmt<T, I> extends Ok<infer S, infer J>
					? ParseReturning<T, SkipFormat<T, J>> extends Ok<infer Ret, infer J2>
						? Close<T, J2, Fn<"json_array", [], Ret, true, [], [], S>>
						: ParseReturning<T, SkipFormat<T, J>>
					: ParseSelectStmt<T, I>
				: ParseArrayValues<T, I, []>;
type ParseArrayValues<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	ParseJsonValue<T, I> extends Ok<infer V, infer J>
		? EatOp<T, J, ","> extends never
			? CtorOptions<T, J, "json_array", [...Acc, V]>
			: ParseArrayValues<T, Nx<J>, [...Acc, V]>
		: ParseJsonValue<T, I>;
type ParseObjectAgg<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer K, infer J>
		? T[J] extends OpTok<":"> | WordTok<"value">
			? ParseJsonValue<T, Nx<J>> extends Ok<infer V, infer J2>
				? AggTail<T, J2, "json_objectagg", [K, V]>
				: ParseJsonValue<T, Nx<J>>
			: Expected<'":" or VALUE', T, J>
		: ParseExpr<T, I, 0>;

type ParseArrayAgg<T extends Toks, I extends number> =
	ParseJsonValue<T, I> extends Ok<infer V, infer J>
		? SkipAggOrderBy<T, J> extends infer J1 extends number
			? AggTail<T, J1, "json_arrayagg", [V]>
			: SkipAggOrderBy<T, J>
		: ParseJsonValue<T, I>;
type AggTail<
	T extends Toks,
	I extends number,
	W extends "json_objectagg" | "json_arrayagg",
	Args,
> =
	NullClause<T, I, W extends "json_arrayagg" ? true : false> extends [
		infer Absent,
		infer J extends number,
	]
		? ParseReturning<
				T,
				W extends "json_objectagg" ? SkipUniqueKeys<T, J> : J
			> extends Ok<infer Ret, infer J2>
			? EatOp<T, J2, ")"> extends never
				? Expected<'")"', T, J2>
				: AggSuffix<
						T,
						W,
						`${AggBase<Ret>}_${W extends "json_objectagg" ? "object_agg" : "agg"}${Absent extends true ? "_strict" : ""}`,
						Args,
						Ret,
						Nx<J2>
					>
			: ParseReturning<T, W extends "json_objectagg" ? SkipUniqueKeys<T, J> : J>
		: never;
type AggBase<Ret> = Ret extends "jsonb" ? "jsonb" : "json";
type AggSuffix<
	T extends Toks,
	F extends string,
	Name extends string,
	Args,
	Ret,
	I extends number,
> =
	ParseFilter<T, I> extends Ok<infer Flt, infer I1>
		? ParseOver<T, I1> extends Ok<infer Ov, infer I2>
			? Ok<
					{
						t: "jsonagg";
						fn: F;
						ret: Ret;
						e: CallNode<
							Name,
							Args,
							false,
							Flt,
							Ov extends null ? false : true,
							Ov,
							null
						>;
					},
					I2
				>
			: ParseOver<T, I1>
		: ParseFilter<T, I>;

type ParseQueryFn<T extends Toks, W extends string, I extends number> =
	ParseCtxPath<T, I> extends Ok<[infer Cx, infer Path], infer J2>
		? ParsePassing<T, J2> extends Ok<infer Passing, infer J3>
			? W extends "json_exists"
				? QueryTail<T, W, [Cx, Path], Passing, null, J3>
				: ParseReturning<T, J3> extends Ok<infer Ret, infer J4>
					? QueryTail<
							T,
							W,
							[Cx, Path],
							Passing,
							Ret,
							W extends "json_query" ? SkipQuotes<T, SkipWrapper<T, J4>> : J4
						>
					: ParseReturning<T, J3>
			: ParsePassing<T, J2>
		: ParseCtxPath<T, I>;
type ParseCtxPath<T extends Toks, I extends number> =
	ParseJsonValue<T, I> extends Ok<infer Cx, infer J>
		? EatOp<T, J, ","> extends never
			? Expected<'","', T, J>
			: ParseExpr<T, Nx<J>, 0> extends Ok<infer Path, infer J2>
				? Ok<[Cx, Path], J2>
				: ParseExpr<T, Nx<J>, 0>
		: ParseJsonValue<T, I>;
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
						false,
						Passing,
						DefaultsOf<Bs>,
						null,
						Bs[1] extends { k: "unknown" } ? true : false
					>
				>
			: B
		: never;

export type ParseJsonTable<T extends Toks, I extends number> =
	ParseCtxPath<T, I> extends Ok<[infer Cx, infer Path], infer J2>
		? PathName<T, J2> extends [
				infer Names extends readonly string[],
				infer J3 extends number,
			]
			? ParsePassing<T, J3> extends Ok<infer Passing, infer J4>
				? ParseColumnsClause<
						T,
						J4,
						{
							top: true;
							own: [];
							nest: [];
							names: Names;
							defs: [];
							ord: false;
						}
					> extends infer Cs
					? Cs extends Ok<
							infer Body extends {
								cols: unknown;
								names: unknown;
								defs: unknown;
							},
							infer J5
						>
						? ParseBehaviors<T, J5, false, TableBehavior, ""> extends infer B
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
				: ParsePassing<T, J3>
			: never
		: ParseCtxPath<T, I>;
type PathName<T extends Toks, I extends number> =
	T[I] extends WordTok<"as">
		? Ident<T, Nx<I>> extends [infer N, infer J]
			? [[N], J]
			: [[], I]
		: [[], I];

type ColsState = {
	readonly top: boolean;
	readonly own: readonly unknown[];
	readonly nest: readonly unknown[];
	readonly names: readonly unknown[];
	readonly defs: readonly unknown[];
	readonly ord: boolean;
};
type AddCol<
	S extends ColsState,
	C,
	N,
	Ds extends readonly unknown[] = [],
	Ord = S["ord"],
> = {
	top: S["top"];
	own: [...S["own"], C];
	nest: S["nest"];
	names: [...S["names"], N];
	defs: [...S["defs"], ...Ds];
	ord: Ord;
};

type ParseColumnsClause<T extends Toks, I extends number, S extends ColsState> =
	EatWord<T, I, "columns"> extends never
		? Expected<"COLUMNS", T, I>
		: EatOp<T, Nx<I>, "("> extends never
			? Expected<'"("', T, Nx<I>>
			: ParseColumns<T, Nx2<I>, S>;
type ParseColumns<T extends Toks, I extends number, S extends ColsState> =
	T[I] extends WordTok<"nested">
		? T[Nx<I>] extends WordTok<"path"> | StrTok
			? ParseNested<T, SkipWord<T, Nx<I>, "path">, S>
			: ParseColumn<T, I, S>
		: ParseColumn<T, I, S>;
type ColumnsNext<T extends Toks, I extends number, S extends ColsState> =
	EatOp<T, I, ","> extends never
		? EatOp<T, I, ")"> extends never
			? Expected<'"," or ")"', T, I>
			: Ok<
					{
						cols: [...S["own"], ...S["nest"]];
						names: S["names"];
						defs: S["defs"];
					},
					Nx<I>
				>
		: ParseColumns<T, Nx<I>, S>;

type ParseColumn<T extends Toks, I extends number, S extends ColsState> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatWords<T, J, ["for", "ordinality"]> extends never
			? ParseTypeName<T, J> extends Ok<infer Ty extends string, infer J2>
				? T[J2] extends WordTok<"exists">
					? ParsePathOpt<T, Nx<J2>> extends infer P extends number
						? ParseBehaviors<
								T,
								P,
								false,
								ExistsBehavior,
								` for column "${N}"`
							> extends infer B
							? B extends Ok<unknown, infer J3>
								? ColumnsNext<T, J3, AddCol<S, Col<N, Ty, true>, N>>
								: B
							: never
						: ParsePathOpt<T, Nx<J2>>
					: ParsePathOpt<T, SkipFormat<T, J2>> extends infer P extends number
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
										AddCol<S, Col<N, Ty, true>, N, DefaultsOf<Bs>>
									>
								: B
							: never
						: ParsePathOpt<T, SkipFormat<T, J2>>
				: ParseTypeName<T, J>
			: S["ord"] extends true
				? Fail<"only one FOR ORDINALITY column is allowed", I>
				: ColumnsNext<
						T,
						Nx2<J>,
						AddCol<
							S,
							Col<N, "int4", S["top"] extends true ? false : true>,
							N,
							[],
							true
						>
					>
		: Expected<"column definition", T, I>;
type Col<N extends string, Ty extends string, Nullable extends boolean> = {
	n: N;
	t: { type: Ty; nullable: Nullable };
};
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
type ParsePathOpt<T extends Toks, I extends number> =
	EatWord<T, I, "path"> extends never
		? I
		: T[Nx<I>] extends StrTok
			? Nx2<I>
			: Expected<"path string", T, Nx<I>>;

type ParseNested<
	T extends Toks,
	I extends number,
	S extends ColsState,
> = T[I] extends StrTok
	? PathName<T, Nx<I>> extends [
			infer PN extends readonly string[],
			infer J extends number,
		]
		? ParseColumnsClause<
				T,
				J,
				{
					top: false;
					own: [];
					nest: [];
					names: [...S["names"], ...PN];
					defs: S["defs"];
					ord: false;
				}
			> extends infer X
			? X extends Ok<
					{
						cols: infer Cs extends readonly unknown[];
						names: infer Ns extends readonly unknown[];
						defs: infer Ds extends readonly unknown[];
					},
					infer J2
				>
				? ColumnsNext<
						T,
						J2,
						{
							top: S["top"];
							own: S["own"];
							nest: [...S["nest"], ...Cs];
							names: Ns;
							defs: Ds;
							ord: S["ord"];
						}
					>
				: X
			: never
		: never
	: Expected<"path string", T, I>;
