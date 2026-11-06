import type { NameOf } from "../../../engine/family/lex.js";
import type {
	Expect,
	IsOp,
	IsWord,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { Ok, Toks } from "../../../engine/tokens.js";

/**
 * A column type in `CREATE TABLE`, normalized to the name TypeSQL types it by:
 * lowercase, without lengths, with ` unsigned` for unsigned integers, and
 * MySQL's aliases resolved (`INTEGER` → `int`, `BOOL` → `tinyint`, …).
 */
export type ParseColumnType<T extends Toks, I extends number> =
	TypeWords<T, I> extends [infer W extends string, infer J extends number]
		? Canon<W> extends infer C extends string
			? C extends ""
				? SyntaxErr<T, I>
				: C extends "enum" | "set"
					? EnumValues<T, J, C>
					: TypeArgs<T, J> extends infer A
						? A extends Ok<
								infer Args extends readonly string[],
								infer J2 extends number
							>
							? Modifiers<T, J2, false> extends [
									infer Unsigned extends boolean,
									infer J3 extends number,
								]
								? Ok<
										{
											type: Final<C, Args, Unsigned>;
											enumValues: null;
										},
										J3
									>
								: never
							: A
						: never
			: never
		: SyntaxErr<T, I>;

/** One or two words: `double precision`, `character varying`, `long varchar`, … */
type TypeWords<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "double"
		? IsWord<T, Next<I>, "precision"> extends true
			? ["double", Next<Next<I>>]
			: ["double", Next<I>]
		: W extends "character" | "char"
			? IsWord<T, Next<I>, "varying"> extends true
				? ["varchar", Next<Next<I>>]
				: [W, Next<I>]
			: W extends "national"
				? T[Next<I>] extends {
						readonly k: "w";
						readonly v: infer W2 extends "char" | "character" | "varchar";
					}
					? IsWord<T, Next<Next<I>>, "varying"> extends true
						? ["varchar", Next<Next<Next<I>>>]
						: [W2, Next<Next<I>>]
					: [W, Next<I>]
				: W extends "nchar"
					? IsWord<T, Next<I>, "varying" | "varchar"> extends true
						? ["varchar", Next<Next<I>>]
						: ["char", Next<I>]
					: W extends "long"
						? T[Next<I>] extends {
								readonly k: "w";
								readonly v: infer W2 extends "varchar" | "varbinary";
							}
							? [
									W2 extends "varchar" ? "mediumtext" : "mediumblob",
									Next<Next<I>>,
								]
							: IsWord<T, Next<I>, "char"> extends true
								? IsWord<T, Next<Next<I>>, "varying"> extends true
									? ["mediumtext", Next<Next<Next<I>>>]
									: ["mediumtext", Next<Next<I>>]
								: ["mediumtext", Next<I>]
						: [W, Next<I>]
	: T[I] extends { readonly k: "id" }
		? [Lowercase<NameOf<T[I]> & string>, Next<I>]
		: null;

type Canon<W extends string> = W extends
	| "tinyint"
	| "smallint"
	| "mediumint"
	| "int"
	| "bigint"
	| "decimal"
	| "float"
	| "double"
	| "bit"
	| "char"
	| "varchar"
	| "binary"
	| "varbinary"
	| "tinytext"
	| "text"
	| "mediumtext"
	| "longtext"
	| "tinyblob"
	| "blob"
	| "mediumblob"
	| "longblob"
	| "enum"
	| "set"
	| "date"
	| "datetime"
	| "timestamp"
	| "time"
	| "year"
	| "json"
	| "geometry"
	| "point"
	| "linestring"
	| "polygon"
	| "multipoint"
	| "multilinestring"
	| "multipolygon"
	| "geometrycollection"
	| "uuid"
	| "inet4"
	| "inet6"
	| "vector"
	| "serial"
	? W
	: W extends "integer" | "int4"
		? "int"
		: W extends "int1" | "bool" | "boolean"
			? "tinyint"
			: W extends "int2"
				? "smallint"
				: W extends "int3" | "middleint"
					? "mediumint"
					: W extends "int8"
						? "bigint"
						: W extends "dec" | "numeric" | "fixed" | "number"
							? "decimal"
							: W extends "real" | "float8" | "double"
								? "double"
								: W extends "float4"
									? "float"
									: W extends "character"
										? "char"
										: W extends "varcharacter" | "varchar2" | "nvarchar"
											? "varchar"
											: W extends "geomcollection"
												? "geometrycollection"
												: W extends "clob"
													? "longtext"
													: W extends "raw"
														? "varbinary"
														: "";

type TypeArgs<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? T[Next<I>] extends { readonly k: "n"; readonly v: infer A extends string }
			? IsOp<T, Next<Next<I>>, ","> extends true
				? T[Next<Next<Next<I>>>] extends {
						readonly k: "n";
						readonly v: infer B extends string;
					}
					? Expect<T, Next<Next<Next<Next<I>>>>, ")"> extends infer J
						? J extends number
							? Ok<[A, B], J>
							: J
						: never
					: SyntaxErr<T, Next<Next<Next<I>>>>
				: Expect<T, Next<Next<I>>, ")"> extends infer J
					? J extends number
						? Ok<[A], J>
						: J
					: never
			: SyntaxErr<T, Next<I>>
		: Ok<[], I>;

type Modifiers<
	T extends Toks,
	I extends number,
	U extends boolean,
> = T[I] extends { readonly k: "w"; readonly v: infer W extends string }
	? W extends "unsigned"
		? Modifiers<T, Next<I>, true>
		: W extends "signed" | "zerofill"
			? Modifiers<T, Next<I>, U>
			: [U, I]
	: [U, I];

type Final<
	C extends string,
	Args extends readonly string[],
	Unsigned extends boolean,
> = C extends "tinyint" | "smallint" | "mediumint" | "int" | "bigint"
	? Unsigned extends true
		? `${C} unsigned`
		: C
	: C extends "float"
		? Args extends readonly [infer P extends string]
			? P extends `${"25" | "26" | "27" | "28" | "29" | "3" | "4" | "5"}${string}`
				? "double"
				: "float"
			: "float"
		: C;

/** `ENUM('a', 'b')` and `SET('a', 'b')`: the values, joined by `\u0000`. */
type EnumValues<T extends Toks, I extends number, C extends string> =
	IsOp<T, I, "("> extends true
		? EnumLoop<T, Next<I>, C, never>
		: SyntaxErr<T, I>;
type EnumLoop<
	T extends Toks,
	I extends number,
	C extends string,
	Acc extends string,
> = T[I] extends { readonly k: "s"; readonly v: infer V extends string }
	? IsOp<T, Next<I>, ","> extends true
		? EnumLoop<T, Next<Next<I>>, C, Acc | V>
		: Expect<T, Next<I>, ")"> extends infer J
			? J extends number
				? Ok<{ type: C; enumValues: Acc | V }, J>
				: J
			: never
	: SyntaxErr<T, I>;

/** The target of `CAST(x AS …)` or `CONVERT(x, …)`, as the type of the result. */
export type ParseCastType<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "signed" | "unsigned"
		? (
				IsWord<T, Next<I>, "integer" | "int"> extends true
					? Next<Next<I>>
					: Next<I>
			) extends infer J extends number
			? Ok<W extends "signed" ? "bigint" : "bigint unsigned", J>
			: never
		: W extends "integer" | "int"
			? Ok<"bigint", Next<I>>
			: W extends "char" | "nchar" | "varchar" | "character" | "national"
				? CastLength<
						T,
						W extends "national" ? Next<Next<I>> : Next<I>
					> extends infer J
					? J extends number
						? Ok<"varchar", SkipCharset<T, J>>
						: J
					: never
				: W extends "binary" | "varbinary"
					? CastLength<T, Next<I>> extends infer J
						? J extends number
							? Ok<"varbinary", J>
							: J
						: never
					: W extends
								| "date"
								| "datetime"
								| "time"
								| "decimal"
								| "double"
								| "float"
								| "real"
								| "json"
								| "year"
								| "dec"
						? CastArgs<T, Next<I>> extends infer J
							? J extends number
								? Ok<
										CastOf<W, T, Next<I>>,
										IsWord<T, J, "precision"> extends true ? Next<J> : J
									>
								: J
							: never
						: SyntaxErr<T, I>
	: SyntaxErr<T, I>;
type CastOf<W extends string, T extends Toks, I extends number> = W extends
	| "real"
	| "double"
	? "double"
	: W extends "dec"
		? "decimal"
		: W extends "float"
			? IsOp<T, I, "("> extends true
				? T[Next<I>] extends {
						readonly v: `${"25" | "26" | "27" | "28" | "29" | "3" | "4" | "5"}${string}`;
					}
					? "double"
					: "float"
				: "float"
			: W;
type CastLength<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? T[Next<I>] extends { readonly k: "n" }
			? Expect<T, Next<Next<I>>, ")">
			: SyntaxErr<T, Next<I>>
		: I;
type CastArgs<T extends Toks, I extends number> =
	TypeArgs<T, I> extends infer A
		? A extends Ok<unknown, infer J extends number>
			? J
			: A
		: never;
type SkipCharset<T extends Toks, I extends number> =
	IsWord<T, I, "character"> extends true
		? IsWord<T, Next<I>, "set"> extends true
			? Next<Next<Next<I>>>
			: I
		: IsWord<T, I, "charset"> extends true
			? Next<Next<I>>
			: IsWord<T, I, "ascii" | "unicode" | "binary"> extends true
				? Next<I>
				: I;
