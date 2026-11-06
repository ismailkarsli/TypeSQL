import type {
	LastPart,
	NameAt,
	NamedAt,
} from "../../../engine/family/diagnostics.js";
import type {
	ArityOk,
	DeclaredFn,
	PickSig,
} from "../../../engine/family/functions.js";
import type { JsonShapeOf, JsonStep } from "../../../engine/family/json.js";
import type {
	AllNull,
	AnyNull,
	NonZeroDigits,
} from "../../../engine/family/typer.js";
import type { AggCtx } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { CappedLen, DigitsLE } from "../../../engine/num.js";
import type { Or } from "../../../engine/object.js";
import type { ColInfo, Info } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Shaped, TsShape } from "../../../schema.js";
import type {
	Call,
	Cast,
	ColRef,
	Expr,
	Interval,
	RowCtor,
	SelectStmt,
} from "../ast.js";
import type { ResolveColumn } from "../binder/scope.js";
import type { ProjectSelect } from "../project/select.js";
import type { Cat, Cell, FlavorOf, IsUnsigned, MyCtx } from "../types.js";
import type { Fn, FunctionCatalog, Functions, SigFn } from "./functions.js";
import type { JsonGet, JsonPath } from "./json.js";

/** An integer that came from short literals, which MariaDB types `int`. */
type LitInfo<T, N = false> = Info<T, N> & { readonly lit: true };

type Fl<C extends MyCtx> = FlavorOf<C["db"]>;
/** The type comparisons and other truth values have. */
type BoolT<C extends MyCtx> = Fl<C> extends "mariadb" ? "int" : "bigint";

export type TypeOf<E extends Expr, C extends MyCtx> = E extends {
	readonly t: "col";
}
	? ResolveColumn<
			C["scope"],
			Extract<E, ColRef>,
			E["disp"],
			C["aliases"]
		> extends infer R
		? R extends {
				readonly type: infer T;
				readonly nullable: infer N;
				readonly n: infer D;
			}
			? { readonly type: T; readonly nullable: N; readonly n: D }
			: R
		: never
	: E extends { readonly t: "num"; readonly v: infer V extends string }
		? NumInfo<V, Fl<C>>
		: E extends { readonly t: "str" }
			? Info<"varchar">
			: E extends { readonly t: "blob" }
				? Info<"varbinary">
				: E extends { readonly t: "bool" }
					? Fl<C> extends "mariadb"
						? LitInfo<"int">
						: Info<"bigint">
					: E extends { readonly t: "null" }
						? Info<"null", true>
						: E extends { readonly t: "param" | "var" }
							? Info<"unknown", true>
							: TypeComplex<E, C>;

type NumInfo<V extends string, F> = V extends `${string}${"e" | "E"}${string}`
	? Info<"double">
	: V extends `${string}.${string}`
		? Info<"decimal">
		: IntLiteral<
					Unsign<V>,
					V extends `-${string}` ? true : false
				> extends infer K
			? K extends "small"
				? F extends "mariadb"
					? LitInfo<"int">
					: Info<"bigint">
				: K extends "big"
					? Info<"bigint">
					: K extends "unsigned"
						? Info<"bigint unsigned">
						: Info<"decimal">
			: never;
type Unsign<V extends string> = V extends `-${infer R}` ? Unsign<R> : V;
type StripZeros<S extends string> =
	S extends `0${infer R extends `${string}${string}`}`
		? R extends ""
			? S
			: StripZeros<R>
		: S;
type IntLiteral<V extends string, Neg extends boolean> =
	CappedLen<StripZeros<V>, 21> extends infer N extends number
		? N extends 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
			? "small"
			: N extends 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
				? "big"
				: N extends 19
					? DigitsLE<
							StripZeros<V>,
							Neg extends true ? "9223372036854775808" : "9223372036854775807"
						> extends true
						? "big"
						: Neg extends true
							? "decimal"
							: "unsigned"
					: N extends 20
						? Neg extends true
							? "decimal"
							: DigitsLE<StripZeros<V>, "18446744073709551615"> extends true
								? "unsigned"
								: "decimal"
						: "decimal"
		: never;
type TypeComplex<E extends Expr, C extends MyCtx> = E extends {
	readonly t: "bin";
}
	? TypeBin<E["op"], E["l"], E["r"], C>
	: E extends { readonly t: "un" }
		? TypeUn<E["op"], E["e"], C>
		: E extends { readonly t: "cast" }
			? E["to"] extends "json" | "year"
				? Fl<C> extends "mariadb"
					? SqlError<
							`You have an error in your SQL syntax near '${Uppercase<E["to"]>}'`,
							null
						>
					: TypeCast<Extract<E, Cast>, C>
				: TypeCast<Extract<E, Cast>, C>
			: E extends { readonly t: "convert" }
				? TypeOf<E["e"], C> extends infer X extends ColInfo
					? Info<
							X["type"] extends "null"
								? "null"
								: E["binary"] extends true
									? "varbinary"
									: TextLike<X["type"]>,
							X["nullable"]
						>
					: TypeOf<E["e"], C>
				: E extends { readonly t: "collate" }
					? TypeOf<E["e"], C> extends infer X extends ColInfo
						? Info<X["type"], X["nullable"]>
						: TypeOf<E["e"], C>
					: E extends { readonly t: "call" }
						? TypeCall<Extract<E, Call>, C>
						: E extends { readonly t: "case" }
							? TypeCase<E["operand"], E["whens"], E["else"], C>
							: E extends { readonly t: "is" }
								? TypeOf<E["e"], C> extends infer X extends AnyErr
									? X
									: Info<BoolT<C>>
								: E extends { readonly t: "between" }
									? Pred<[E["e"], E["lo"], E["hi"]], C>
									: E extends { readonly t: "like" }
										? Pred<
												E["esc"] extends Expr
													? [E["e"], E["pat"], E["esc"]]
													: [E["e"], E["pat"]],
												C
											>
										: E extends { readonly t: "in" }
											? TypeIn<E["e"], E["list"], C>
											: E extends { readonly t: "insub" }
												? TypeInSub<E["e"], E["q"], C>
												: E extends { readonly t: "quant" }
													? TypeInSub<E["l"], E["r"], C>
													: E extends { readonly t: "member" }
														? Pred<[E["e"], E["doc"]], C>
														: E extends { readonly t: "match" }
															? TypeList<
																	[...E["cols"], E["against"]],
																	C
																> extends infer X extends AnyErr
																? X
																: Info<"double">
															: E extends { readonly t: "sub" }
																? SubqueryCol<E["q"], C> extends infer X extends
																		ColInfo
																	? Info<X["type"], true>
																	: SubqueryCol<E["q"], C>
																: E extends { readonly t: "exists" }
																	? ProjectSelect<
																			E["q"],
																			C
																		> extends infer X extends AnyErr
																		? X
																		: Info<BoolT<C>>
																	: E extends { readonly t: "assign" }
																		? TypeOf<E["e"], C> extends infer X extends
																				ColInfo
																			? Info<X["type"], X["nullable"]>
																			: TypeOf<E["e"], C>
																		: E extends { readonly t: "ctime" }
																			? Info<CTimeType<E["fn"], Fl<C>>>
																			: E extends { readonly t: "row" }
																				? SqlError<
																						"Operand should contain 1 column(s)",
																						null
																					>
																				: E extends { readonly t: "interval" }
																					? SqlError<
																							"You have an error in your SQL syntax near 'INTERVAL'",
																							null
																						>
																					: SqlError<
																							"You have an error in your SQL syntax near 'DEFAULT'",
																							null
																						>;

type TypeCast<E extends Cast, C extends MyCtx> =
	TypeOf<E["e"], C> extends infer X extends ColInfo
		? Info<
				CastType<E["to"], X["type"]>,
				E extends { readonly lit: true } ? false : CastNull<E["to"], X>
			>
		: TypeOf<E["e"], C>;

type CTimeType<F, Flavor> = F extends "current_date" | "utc_date"
	? "date"
	: F extends "current_time" | "utc_time"
		? "time"
		: F extends "current_user"
			? "varchar"
			: F extends "utc_timestamp"
				? "datetime"
				: Flavor extends "mariadb"
					? "timestamp"
					: "datetime";

export type TypeList<
	L extends readonly Expr[],
	C extends MyCtx,
	Acc extends readonly ColInfo[] = [],
> = L extends readonly [
	infer H extends Expr,
	...infer R extends readonly Expr[],
]
	? TypeOf<H, C> extends infer X extends ColInfo
		? TypeList<R, C, [...Acc, X]>
		: TypeOf<H, C>
	: Acc;

type Pred<L extends readonly Expr[], C extends MyCtx> =
	TypeList<L, C> extends infer X extends readonly ColInfo[]
		? Info<BoolT<C>, AnyNull<X>>
		: TypeList<L, C>;

type TypeIn<
	L extends Expr,
	List extends readonly Expr[],
	C extends MyCtx,
> = L extends {
	readonly t: "row";
	readonly items: infer Items extends readonly Expr[];
}
	? RowList<Items["length"], List> extends infer E extends AnyErr
		? E
		: Pred<[...Items, ...RowItems<List>], C>
	: List extends readonly [infer F extends Expr, ...unknown[]]
		? F extends { readonly t: "row" }
			? SqlError<"Operand should contain 1 column(s)", null>
			: Pred<[L, ...List], C>
		: Pred<[L, ...List], C>;
type RowList<
	N extends number,
	List extends readonly Expr[],
> = List extends readonly [infer H, ...infer R extends readonly Expr[]]
	? H extends {
			readonly t: "row";
			readonly items: infer It extends readonly unknown[];
		}
		? It["length"] extends N
			? RowList<N, R>
			: SqlError<`Operand should contain ${N} column(s)`, null>
		: SqlError<`Operand should contain ${N} column(s)`, null>
	: null;
type RowItems<List extends readonly Expr[]> = List extends readonly [
	infer H,
	...infer R extends readonly Expr[],
]
	? H extends { readonly items: infer It extends readonly Expr[] }
		? [...It, ...RowItems<R>]
		: RowItems<R>
	: [];

export type SubqueryCol<Q extends SelectStmt, C extends MyCtx> =
	ProjectSelect<Q, C> extends infer X extends readonly Cell[]
		? X extends readonly [infer One extends Cell]
			? One["t"]
			: SqlError<"Operand should contain 1 column(s)", null>
		: ProjectSelect<Q, C>;

type TypeInSub<
	L extends Expr,
	Q extends SelectStmt,
	C extends MyCtx,
> = L extends {
	readonly t: "row";
	readonly items: infer Items extends readonly Expr[];
}
	? RowVsSub<Items, Q, C>
	: TypeOf<L, C> extends infer X extends ColInfo
		? SubqueryCol<Q, C> extends infer S extends ColInfo
			? Info<BoolT<C>, X["nullable"] extends true ? true : S["nullable"]>
			: SubqueryCol<Q, C>
		: TypeOf<L, C>;

/** A row constructor against a subquery of as many columns. */
type RowVsSub<
	Items extends readonly Expr[],
	Q extends SelectStmt,
	C extends MyCtx,
> =
	ProjectSelect<Q, C> extends infer X extends readonly Cell[]
		? X["length"] extends Items["length"]
			? TypeList<Items, C> extends readonly ColInfo[]
				? Info<BoolT<C>, true>
				: TypeList<Items, C>
			: SqlError<`Operand should contain ${Items["length"]} column(s)`, null>
		: ProjectSelect<Q, C>;

type CastType<To extends string, From> = From extends "null"
	? "null"
	: To extends "json"
		? From extends { readonly shape: unknown }
			? From extends "json"
				? From
				: "json"
			: "json"
		: To;
/** Strings that don't parse as dates or times are `NULL`. */
type CastNull<To extends string, X extends ColInfo> = To extends
	| "date"
	| "datetime"
	| "time"
	| "year"
	? Cat<X["type"]> extends "temporal" | "null"
		? X["nullable"]
		: true
	: X["nullable"];

type TextLike<T> =
	Cat<T> extends "binary" ? "varchar" : T extends LongText ? T : "varchar";
type LongText = "tinytext" | "text" | "mediumtext" | "longtext";

/** MariaDB types arithmetic on short integers `int`. */
type Narrow<X> = X extends { readonly lit: true }
	? true
	: X extends {
				readonly type:
					| "tinyint"
					| "smallint"
					| "mediumint"
					| "tinyint unsigned"
					| "smallint unsigned"
					| "mediumint unsigned"
					| "year";
			}
		? true
		: false;

type ArithType<
	A extends ColInfo,
	B extends ColInfo,
	F,
	Op,
> = A["type"] extends "null"
	? Info<"null">
	: B["type"] extends "null"
		? Info<"null">
		: (
					F extends "mariadb"
						? Cat<A["type"]> | Cat<B["type"]>
						: Exclude<Cat<A["type"]> | Cat<B["type"]>, "unknown">
				) extends infer K
			? Op extends "div"
				? F extends "mariadb"
					? Narrow<A> extends true
						? LitInfo<"int">
						: Cat<A["type"]> extends
									| "int"
									| "float"
									| "string"
									| "unknown"
									| "json"
									| "binary"
							? Info<"bigint">
							: Info<"int">
					: Info<"bigint">
				: [K] extends ["int" | "bit" | "temporal"]
					? Op extends "/"
						? Info<"decimal">
						: F extends "mariadb"
							? Narrow<A> extends true
								? Narrow<B> extends true
									? LitInfo<
												| IsUnsigned<A["type"]>
												| IsUnsigned<B["type"]> extends false
												? "int"
												: "int unsigned"
										>
									: Info<WideInt<A, B, Op>>
								: Info<WideInt<A, B, Op>>
							: Info<WideInt<A, B, Op>>
					: [K] extends ["int" | "bit" | "temporal" | "decimal"]
						? Info<"decimal">
						: Info<"double">
			: never;
type WideInt<A extends ColInfo, B extends ColInfo, Op> = Op extends "%" | "div"
	? IsUnsigned<A["type"]> extends true
		? "bigint unsigned"
		: "bigint"
	: true extends IsUnsigned<A["type"]> | IsUnsigned<B["type"]>
		? "bigint unsigned"
		: "bigint";

type NonZero<E> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? V extends `${"-" | ""}${"0" | "0.0" | "0." | ".0"}`
		? false
		: NonZeroDigits<V>
	: false;

type TypeBin<Op, L extends Expr, R extends Expr, C extends MyCtx> = Op extends
	| "="
	| "!="
	| "<"
	| ">"
	| "<="
	| ">="
	| "<=>"
	? L extends { readonly t: "row" }
		? RowCompare<Extract<L, RowCtor>, R, C, Op>
		: R extends { readonly t: "row" }
			? SqlError<"Operand should contain 1 column(s)", null>
			: Op extends "<=>"
				? TypeList<[L, R], C> extends infer X extends AnyErr
					? X
					: Info<BoolT<C>>
				: Pred<[L, R], C>
	: Op extends "and" | "or" | "xor" | "sounds"
		? Pred<[L, R], C>
		: Op extends "->" | "->>"
			? Fl<C> extends "mariadb"
				? SqlError<
						`You have an error in your SQL syntax near '${Op & string}'`,
						null
					>
				: L extends { readonly t: "col" }
					? TypeOf<L, C> extends infer A extends ColInfo
						? JsonOp<Op, A, R>
						: TypeOf<L, C>
					: SqlError<
							`You have an error in your SQL syntax near '${Op & string}'`,
							null
						>
			: R extends { readonly t: "interval" }
				? Op extends "+" | "-"
					? DateArith<L, Extract<R, Interval>, C>
					: SqlError<
							"You have an error in your SQL syntax near 'INTERVAL'",
							null
						>
				: L extends { readonly t: "interval" }
					? Op extends "+"
						? DateArith<R, Extract<L, Interval>, C>
						: SqlError<
								"You have an error in your SQL syntax near 'INTERVAL'",
								null
							>
					: TypeOf<L, C> extends infer A extends ColInfo
						? TypeOf<R, C> extends infer B extends ColInfo
							? Op extends "&" | "|" | "^" | "<<" | ">>"
								? Info<
										A["type"] extends "null"
											? "null"
											: B["type"] extends "null"
												? "null"
												: "bigint unsigned",
										Or<A["nullable"], B["nullable"]>
									>
								: ArithType<A, B, Fl<C>, Op> extends infer X extends ColInfo
									? Info<
											X["type"],
											Op extends "/" | "%" | "div"
												? NonZero<R> extends true
													? Or<A["nullable"], B["nullable"]>
													: true
												: Or<A["nullable"], B["nullable"]>
										> &
											(X extends { readonly lit: true }
												? { readonly lit: true }
												: {})
									: never
							: TypeOf<R, C>
						: TypeOf<L, C>;

/** `d + INTERVAL n unit`: a date stays a date for day units and up. */
type DateArith<D extends Expr, Iv extends Interval, C extends MyCtx> =
	TypeOf<D, C> extends infer A extends ColInfo
		? TypeOf<Iv["e"], C> extends infer N extends ColInfo
			? Info<DateAddType<A["type"], Iv["unit"]>, DateAddNull<A, N>>
			: TypeOf<Iv["e"], C>
		: TypeOf<D, C>;
type DayUnit = "day" | "week" | "month" | "quarter" | "year" | "year_month";
type DateAddType<T, U> = T extends "null"
	? "null"
	: T extends "date"
		? U extends DayUnit
			? "date"
			: "datetime"
		: T extends "datetime" | "timestamp"
			? "datetime"
			: T extends "time"
				? "time"
				: "varchar";
type DateAddNull<A extends ColInfo, N extends ColInfo> =
	Cat<A["type"]> extends "temporal" ? Or<A["nullable"], N["nullable"]> : true;

type JsonOp<Op, A extends ColInfo, R extends Expr> =
	JsonShapeOf<A["type"]> extends [infer V]
		? JsonPath<R> extends infer P extends readonly JsonStep[]
			? JsonGet<V, P, Op & ("->" | "->>")> extends infer X extends ColInfo
				? Info<X["type"], Or<X["nullable"], A["nullable"]>>
				: never
			: Info<Op extends "->" ? "json" : "longtext", true>
		: Info<Op extends "->" ? "json" : "longtext", true>;

type RowCompare<
	L extends RowCtor,
	R extends Expr,
	C extends MyCtx,
	Op,
> = R extends {
	readonly t: "row";
}
	? L["items"]["length"] extends R["items"]["length"]
		? Op extends "<=>"
			? TypeList<[...L["items"], ...R["items"]], C> extends infer X extends
					AnyErr
				? X
				: Info<BoolT<C>>
			: Pred<[...L["items"], ...R["items"]], C>
		: SqlError<`Operand should contain ${L["items"]["length"]} column(s)`, null>
	: R extends { readonly t: "sub" }
		? RowVsSub<L["items"], R["q"], C>
		: SqlError<
				`Operand should contain ${L["items"]["length"]} column(s)`,
				null
			>;

type TypeUn<Op, X extends Expr, C extends MyCtx> =
	TypeOf<X, C> extends infer A extends ColInfo
		? Op extends "-"
			? Negate<A, Fl<C>>
			: Op extends "~"
				? Info<
						A["type"] extends "null" ? "null" : "bigint unsigned",
						A["nullable"]
					>
				: Op extends "binary"
					? Info<A["type"] extends "null" ? "null" : "varbinary", A["nullable"]>
					: A extends { readonly lit: true }
						? LitInfo<
								A["type"] extends "null" ? "null" : BoolT<C>,
								A["nullable"]
							>
						: Info<A["type"] extends "null" ? "null" : BoolT<C>, A["nullable"]>
		: TypeOf<X, C>;
type Negate<A extends ColInfo, F> = A["type"] extends "null"
	? Info<"null", true>
	: Cat<A["type"]> extends "temporal"
		? Info<F extends "mariadb" ? "decimal" : "double", A["nullable"]>
		: Cat<A["type"]> extends "int" | "bit"
			? F extends "mariadb"
				? Narrow<A> extends true
					? LitInfo<"int", A["nullable"]>
					: Info<"bigint", A["nullable"]>
				: Info<"bigint", A["nullable"]>
			: Cat<A["type"]> extends "decimal"
				? Info<"decimal", A["nullable"]>
				: Info<"double", A["nullable"]>;

type TypeCase<
	Operand,
	Whens extends readonly unknown[],
	Else,
	C extends MyCtx,
> = (
	Operand extends Expr
		? TypeOf<Operand, C>
		: Info<"null">
) extends infer O extends AnyErr
	? O
	: CaseLoop<Whens, C, [], 0> extends infer Vs extends readonly ColInfo[]
		? (
				Else extends Expr
					? TypeOf<Else, C>
					: Info<"null", true>
			) extends infer El
			? El extends ColInfo
				? Info<Common<[...Vs, El], Fl<C>>, AnyNull<[...Vs, El]>>
				: El
			: never
		: CaseLoop<Whens, C, [], 0>;
type CaseLoop<
	Whens extends readonly unknown[],
	C extends MyCtx,
	Acc extends readonly ColInfo[],
	I extends number,
> = Whens[I] extends {
	readonly when: infer W extends Expr;
	readonly then: infer V extends Expr;
}
	? TypeOf<W, C> extends AnyErr
		? TypeOf<W, C>
		: TypeOf<V, C> extends infer Y extends ColInfo
			? CaseLoop<Whens, C, [...Acc, Y], Next<I>>
			: TypeOf<V, C>
	: Acc;

type IntRank<T> = T extends `tinyint${string}`
	? 1
	: T extends `smallint${string}` | "year"
		? 2
		: T extends `mediumint${string}`
			? 3
			: T extends `int${string}`
				? 4
				: 5;
type IntOfRank<R> = R extends 1
	? "tinyint"
	: R extends 2
		? "smallint"
		: R extends 3
			? "mediumint"
			: R extends 4
				? "int"
				: "bigint";
type MaxRank<U> = 5 extends U
	? 5
	: 4 extends U
		? 4
		: 3 extends U
			? 3
			: 2 extends U
				? 2
				: 1;

/**
 * The type of `CASE`, `IF`, `COALESCE` and `UNION` over values of the given
 * types, as MySQL aggregates them: integers widen, numbers mix to `decimal` or
 * `double`, dates to `datetime`, and anything mixed with a string is a string.
 */
export type Common<L extends readonly ColInfo[], F = "mysql"> =
	Exclude<L[number]["type"], "null" | "unknown"> extends infer U
		? [U] extends [never]
			? "unknown" extends L[number]["type"]
				? "unknown"
				: "null"
			: IsSingle<U> extends true
				? U
				: CommonOf<U, Cat<U>, F>
		: never;
type IsSingle<T, U = T> = T extends unknown
	? [U] extends [T]
		? true
		: false
	: never;
type CommonOf<U, K, F> = [K] extends ["int"]
	? IntCommon<U, F>
	: [K] extends ["int" | "bit"]
		? "bigint"
		: [K] extends ["int" | "decimal" | "bit"]
			? "decimal"
			: [K] extends ["int" | "decimal" | "float" | "bit"]
				? "double"
				: [K] extends ["temporal"]
					? [U] extends ["date" | "datetime" | "timestamp"]
						? "datetime"
						: "datetime"
					: [K] extends ["json"]
						? "json"
						: [K] extends ["geo"]
							? "geometry"
							: [K] extends ["string"]
								? StringCommon<U>
								: "binary" extends K
									? BinaryCommon<U>
									: "json" extends K
										? "longtext"
										: StringCommon<U>;
/**
 * Signed and unsigned integers mix to a signed integer that holds both on
 * MySQL (`decimal` past `bigint`), and to `decimal` on MariaDB.
 */
type IntCommon<U, F> = [Extract<U, `${string} unsigned`>] extends [never]
	? IntOfRank<MaxRank<IntRank<U>>>
	: [Exclude<U, `${string} unsigned`>] extends [never]
		? `${IntOfRank<MaxRank<IntRank<U>>>} unsigned`
		: F extends "mariadb"
			? "decimal"
			: MaxRank<
						IntRank<Extract<U, `${string} unsigned`>>
					> extends infer UR extends number
				? MaxRank<
						IntRank<Exclude<U, `${string} unsigned`>>
					> extends infer SR extends number
					? RankLt<UR, SR> extends true
						? IntOfRank<SR>
						: UR extends 5
							? "decimal"
							: IntOfRank<NextRank<UR>>
					: never
				: never;
/** Integer type ranks 1 (tinyint) to 5 (bigint). */
type RankLt<A, B> = A extends B
	? false
	: A extends 1
		? true
		: A extends 2
			? B extends 3 | 4 | 5
				? true
				: false
			: A extends 3
				? B extends 4 | 5
					? true
					: false
				: A extends 4
					? B extends 5
						? true
						: false
					: false;
type NextRank<R> = R extends 1 ? 2 : R extends 2 ? 3 : R extends 3 ? 4 : 5;
type StringCommon<U> = "longtext" extends U
	? "longtext"
	: "mediumtext" extends U
		? "mediumtext"
		: "text" extends U
			? "text"
			: "varchar";
type BinaryCommon<U> = "longblob" extends U | "longtext"
	? "longblob"
	: "mediumblob" extends U
		? "mediumblob"
		: "blob" extends U | "text"
			? "blob"
			: "varbinary";

type FnOf<E extends Call, C extends MyCtx> =
	DeclaredFn<C["db"], E["name"], FunctionCatalog> extends infer D
		? D extends null
			? E["name"] extends keyof Functions
				? Functions[E["name"]] extends infer F extends Fn
					? F["only"] extends "both" | Fl<C>
						? F
						: null
					: null
				: null
			: SigFn<PickSig<D, E["args"]["length"]>>
		: never;

type TypeCall<E extends Call, C extends MyCtx> =
	FnOf<E, C> extends infer F
		? F extends Fn
			? (
					[F["kind"], E["over"]] extends ["agg", null]
						? [C["inAgg"], C["agg"]] extends [false, "group" | "whole"]
							? CallShape<E, F, C>
							: SqlError<"Invalid use of group function", null>
						: CallShape<E, F, C>
				) extends infer M extends AnyErr
				? M
				: (
							[F["kind"], E["over"]] extends ["agg", null]
								? AggCtx<C>
								: C
						) extends infer AC extends MyCtx
					? CallArgTypes<E, AC> extends infer Args extends readonly ColInfo[]
						? CheckExtras<E, AC> extends AnyErr
							? CheckExtras<E, AC>
							: E["name"] extends "json_extract"
								? E["args"]["length"] extends 2
									? JsonOp<"->", Args[0], E["args"][1]>
									: Info<"json", true>
								: Info<RetType<F["ret"], Args, E, C>, NullOf<F, E, Args, C>> &
										(F["ret"] extends "abs" | "round" | "ceil" | "mod" | "arg0"
											? Args[0] extends { readonly lit: true }
												? { readonly lit: true }
												: {}
											: {})
						: CallArgTypes<E, AC>
					: never
			: SqlError<
					`FUNCTION ${E["disp"]} does not exist`,
					NameAt<
						LastPart<Lowercase<E["disp"]>>,
						"function",
						Lowercase<E["disp"]>
					>
				>
		: never;

/** The second argument of DATE_ADD and friends may be an `INTERVAL`. */
type CallArgTypes<
	E extends Call,
	C extends MyCtx,
> = E["args"] extends readonly [
	infer A0 extends Expr,
	infer A1 extends { readonly t: "interval"; readonly e: Expr },
]
	? TypeList<[A0, A1["e"]], C>
	: TypeList<E["args"], C>;

type Incorrect<E extends Call> = SqlError<
	`Incorrect parameter count in the call to native function '${E["disp"]}'`,
	NamedAt<E["disp"]>
>;

type CallShape<
	E extends Call,
	F extends Fn,
	C extends MyCtx,
> = E["star"] extends true
	? E["name"] extends "count"
		? E["over"] extends null
			? null
			: null
		: SqlError<`You have an error in your SQL syntax near '*'`, null>
	: E["name"] extends "count"
		? E["args"]["length"] extends 1
			? null
			: E["distinct"] extends true
				? null
				: SqlError<`You have an error in your SQL syntax near ','`, null>
		: ArityOk<E["args"]["length"], F["min"], F["max"]> extends false
			? Incorrect<E>
			: F["kind"] extends "win"
				? E["name"] extends "lag" | "lead"
					? E["args"]["length"] extends 3
						? Fl<C> extends "mariadb"
							? SqlError<`You have an error in your SQL syntax near ','`, null>
							: E["over"] extends null
								? SqlError<
										`You have an error in your SQL syntax near ')'`,
										null
									>
								: null
						: E["over"] extends null
							? SqlError<`You have an error in your SQL syntax near ')'`, null>
							: null
					: E["over"] extends null
						? SqlError<`You have an error in your SQL syntax near ')'`, null>
						: null
				: F["kind"] extends "agg"
					? null
					: E["over"] extends null
						? E["distinct"] extends true
							? SqlError<
									`You have an error in your SQL syntax near 'DISTINCT'`,
									null
								>
							: null
						: SqlError<
								`You have an error in your SQL syntax near 'OVER'`,
								null
							>;

type CheckExtras<E extends Call, C extends MyCtx> =
	TypeList<E["order"], C> extends AnyErr
		? TypeList<E["order"], C>
		: E["over"] extends {
					readonly partition: infer P extends readonly Expr[];
					readonly order: infer O extends readonly Expr[];
				}
			? TypeList<[...P, ...O], C>
			: true;

type AnyBinary<A extends readonly ColInfo[]> = true extends {
	[I in keyof A]: Cat<A[I]["type"]> extends "binary" ? true : false;
}[number]
	? true
	: false;

type RetType<
	R extends string,
	A extends readonly ColInfo[],
	E extends Call,
	C extends MyCtx,
> = R extends "arg0"
	? A[0]["type"]
	: R extends "arg1"
		? A[1]["type"]
		: R extends "nullif"
			? Fl<C> extends "mysql"
				? Cat<A[0]["type"]> extends "temporal"
					? "varchar"
					: A[0]["type"]
				: A[0]["type"]
			: R extends "common"
				? Common<A, Fl<C>>
				: R extends "greatest"
					? Fl<C> extends "mariadb"
						? MariaGreatest<A>
						: Common<A, Fl<C>>
					: R extends "iif"
						? Common<
								A extends readonly [
									unknown,
									...infer Rest extends readonly ColInfo[],
								]
									? Rest
									: A,
								Fl<C>
							>
						: R extends "bool"
							? BoolT<C>
							: R extends "intf"
								? Fl<C> extends "mariadb"
									? "int"
									: "bigint"
								: R extends "uintf"
									? Fl<C> extends "mariadb"
										? "int unsigned"
										: "bigint unsigned"
									: R extends "str"
										? AnyBinary<A> extends true
											? "varbinary"
											: A[0]["type"] extends LongText
												? A[0]["type"]
												: "varchar"
										: R extends "text"
											? AnyBinary<A> extends true
												? "blob"
												: "text"
											: R extends "lag"
												? A[0]["type"]
												: R extends "now"
													? Fl<C> extends "mariadb"
														? "timestamp"
														: "datetime"
													: NumericRet<R, A, E, C>;
type NumericRet<
	R extends string,
	A extends readonly ColInfo[],
	E extends Call,
	C extends MyCtx,
> = R extends "sum" | "avg"
	? A[0]["type"] extends "null"
		? "double"
		: A[0]["type"] extends "enum" | "set"
			? Fl<C> extends "mariadb"
				? "decimal"
				: "double"
			: Cat<A[0]["type"]> extends "int" | "decimal" | "bit" | "temporal"
				? "decimal"
				: "double"
	: R extends "abs"
		? A[0]["type"] extends "null"
			? "null"
			: Cat<A[0]["type"]> extends "int"
				? Fl<C> extends "mariadb"
					? Narrow<A[0]> extends true
						? "int"
						: A[0]["type"] extends `bigint${string}`
							? A[0]["type"]
							: "bigint"
					: A[0]["type"]
				: Cat<A[0]["type"]> extends "decimal"
					? "decimal"
					: "double"
		: R extends "ceil"
			? A[0]["type"] extends "null"
				? "null"
				: Cat<A[0]["type"]> extends "int" | "decimal"
					? Fl<C> extends "mariadb"
						? A[0]["type"] extends `bigint${string}`
							? "bigint"
							: "int"
						: "bigint"
					: "double"
			: R extends "round"
				? A[0]["type"] extends "null"
					? "null"
					: Cat<A[0]["type"]> extends "int"
						? Fl<C> extends "mariadb"
							? A[0]["type"] extends `bigint${string}`
								? "bigint"
								: "int"
							: "bigint"
						: Cat<A[0]["type"]> extends "decimal"
							? "decimal"
							: "double"
				: R extends "mod"
					? A[0]["type"] extends "null"
						? "null"
						: A[1]["type"] extends "null"
							? "null"
							: ArithType<A[0], A[1], Fl<C>, "%">["type"]
					: R extends "dateadd"
						? DateAddType<
								A[0]["type"],
								E["args"][1] extends {
									readonly t: "interval";
									readonly unit: infer U;
								}
									? U
									: "day"
							>
						: R extends "addtime"
							? A[0]["type"] extends "null"
								? "null"
								: A[0]["type"] extends "time"
									? "time"
									: Cat<A[0]["type"]> extends "temporal"
										? "datetime"
										: "varchar"
							: R extends "fromunix"
								? A["length"] extends 1
									? "datetime"
									: "varchar"
								: R extends "unixts"
									? A extends readonly []
										? "bigint"
										: A[0]["type"] extends "date" | "datetime" | "timestamp"
											? "bigint"
											: "decimal"
									: R extends "strtodate"
										? StrToDate<E["args"][1]>
										: R extends "jsonunquote"
											? A[0]["type"] extends {
													readonly shape: { readonly v: infer V };
												}
												? Shaped<
														"longtext",
														TsShape<V extends string ? V : string>
													>
												: "longtext"
											: R extends "jsonvalue"
												? "varchar"
												: R;

type TemporalOf<A extends readonly ColInfo[]> =
	Extract<
		A[number]["type"],
		"date" | "datetime" | "timestamp" | "time"
	> extends infer T
		? IsSingle<T> extends true
			? T
			: "datetime"
		: never;
/** MariaDB's GREATEST and LEAST compare mixed or NULL arguments as numbers. */
type MariaGreatest<A extends readonly ColInfo[]> =
	"null" extends A[number]["type"]
		? "double"
		: Cat<A[number]["type"]> extends infer K
			? [K] extends ["string"]
				? Common<A, "mariadb">
				: "string" extends K
					? "temporal" extends K
						? TemporalOf<A>
						: [Extract<K, "int" | "decimal" | "float" | "bit">] extends [never]
							? Common<A, "mariadb">
							: "double"
					: Common<A, "mariadb">
			: never;

type TimeSpec =
	| "H"
	| "h"
	| "I"
	| "i"
	| "k"
	| "l"
	| "p"
	| "r"
	| "S"
	| "s"
	| "T"
	| "f";
type DateSpec =
	| "Y"
	| "y"
	| "m"
	| "c"
	| "d"
	| "e"
	| "D"
	| "j"
	| "M"
	| "b"
	| "a"
	| "W"
	| "U"
	| "u"
	| "V"
	| "v"
	| "X"
	| "x"
	| "w";
type HasSpec<
	S extends string,
	K extends string,
> = S extends `${string}%${infer C}${infer R}`
	? C extends K
		? true
		: HasSpec<R, K>
	: false;
type StrToDate<F> = F extends {
	readonly t: "str";
	readonly v: infer S extends string;
}
	? HasSpec<S, TimeSpec> extends true
		? HasSpec<S, DateSpec> extends true
			? "datetime"
			: "time"
		: "date"
	: "datetime";

type NullOf<
	F extends Fn,
	E extends Call,
	A extends readonly ColInfo[],
	C extends MyCtx,
> = F["null"] extends "never"
	? false
	: F["null"] extends "args"
		? AnyNull<A>
		: F["null"] extends "arg0"
			? A[0]["nullable"]
			: F["null"] extends "always"
				? true
				: F["null"] extends "all"
					? AllNull<A>
					: F["null"] extends "iif"
						? A extends readonly [
								unknown,
								...infer Rest extends readonly ColInfo[],
							]
							? AnyNull<Rest>
							: true
						: F["null"] extends "lag"
							? A extends readonly [
									infer X extends ColInfo,
									unknown,
									infer D extends ColInfo,
								]
								? Or<X["nullable"], D["nullable"]>
								: true
							: F["null"] extends "temporal"
								? true extends {
										[I in keyof A]: Cat<A[I]["type"]> extends "temporal"
											? A[I]["nullable"]
											: true;
									}[number]
									? true
									: false
								: E["over"] extends null
									? C["agg"] extends "group"
										? A[0]["nullable"]
										: true
									: A[0]["nullable"];

export type CheckBool<E extends Expr, C extends MyCtx> =
	TypeOf<E, C> extends infer X extends AnyErr ? X : true;
