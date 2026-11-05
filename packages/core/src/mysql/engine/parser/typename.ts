import type { NameOf } from "../tokens.js";
import type { Expect, IsOp, IsWord, Nx, Ok, SyntaxErr, Toks } from "./util.js";

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
		? IsWord<T, Nx<I>, "precision"> extends true
			? ["double", Nx<Nx<I>>]
			: ["double", Nx<I>]
		: W extends "character" | "char"
			? IsWord<T, Nx<I>, "varying"> extends true
				? ["varchar", Nx<Nx<I>>]
				: [W, Nx<I>]
			: W extends "national"
				? T[Nx<I>] extends {
						readonly k: "w";
						readonly v: infer W2 extends "char" | "character" | "varchar";
					}
					? IsWord<T, Nx<Nx<I>>, "varying"> extends true
						? ["varchar", Nx<Nx<Nx<I>>>]
						: [W2, Nx<Nx<I>>]
					: [W, Nx<I>]
				: W extends "nchar"
					? IsWord<T, Nx<I>, "varying" | "varchar"> extends true
						? ["varchar", Nx<Nx<I>>]
						: ["char", Nx<I>]
					: W extends "long"
						? T[Nx<I>] extends {
								readonly k: "w";
								readonly v: infer W2 extends "varchar" | "varbinary";
							}
							? [W2 extends "varchar" ? "mediumtext" : "mediumblob", Nx<Nx<I>>]
							: IsWord<T, Nx<I>, "char"> extends true
								? IsWord<T, Nx<Nx<I>>, "varying"> extends true
									? ["mediumtext", Nx<Nx<Nx<I>>>]
									: ["mediumtext", Nx<Nx<I>>]
								: ["mediumtext", Nx<I>]
						: [W, Nx<I>]
	: T[I] extends { readonly k: "id" }
		? [Lowercase<NameOf<T[I]> & string>, Nx<I>]
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
		? T[Nx<I>] extends { readonly k: "n"; readonly v: infer A extends string }
			? IsOp<T, Nx<Nx<I>>, ","> extends true
				? T[Nx<Nx<Nx<I>>>] extends {
						readonly k: "n";
						readonly v: infer B extends string;
					}
					? Expect<T, Nx<Nx<Nx<Nx<I>>>>, ")"> extends infer J
						? J extends number
							? Ok<[A, B], J>
							: J
						: never
					: SyntaxErr<T, Nx<Nx<Nx<I>>>>
				: Expect<T, Nx<Nx<I>>, ")"> extends infer J
					? J extends number
						? Ok<[A], J>
						: J
					: never
			: SyntaxErr<T, Nx<I>>
		: Ok<[], I>;

type Modifiers<
	T extends Toks,
	I extends number,
	U extends boolean,
> = T[I] extends { readonly k: "w"; readonly v: infer W extends string }
	? W extends "unsigned"
		? Modifiers<T, Nx<I>, true>
		: W extends "signed" | "zerofill"
			? Modifiers<T, Nx<I>, U>
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
	IsOp<T, I, "("> extends true ? EnumLoop<T, Nx<I>, C, never> : SyntaxErr<T, I>;
type EnumLoop<
	T extends Toks,
	I extends number,
	C extends string,
	Acc extends string,
> = T[I] extends { readonly k: "s"; readonly v: infer V extends string }
	? IsOp<T, Nx<I>, ","> extends true
		? EnumLoop<T, Nx<Nx<I>>, C, Acc | V>
		: Expect<T, Nx<I>, ")"> extends infer J
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
				IsWord<T, Nx<I>, "integer" | "int"> extends true
					? Nx<Nx<I>>
					: Nx<I>
			) extends infer J extends number
			? Ok<W extends "signed" ? "bigint" : "bigint unsigned", J>
			: never
		: W extends "integer" | "int"
			? Ok<"bigint", Nx<I>>
			: W extends "char" | "nchar" | "varchar" | "character" | "national"
				? CastLength<
						T,
						W extends "national" ? Nx<Nx<I>> : Nx<I>
					> extends infer J
					? J extends number
						? Ok<"varchar", SkipCharset<T, J>>
						: J
					: never
				: W extends "binary" | "varbinary"
					? CastLength<T, Nx<I>> extends infer J
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
						? CastArgs<T, Nx<I>> extends infer J
							? J extends number
								? Ok<
										CastOf<W, T, Nx<I>>,
										IsWord<T, J, "precision"> extends true ? Nx<J> : J
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
				? T[Nx<I>] extends {
						readonly v: `${"25" | "26" | "27" | "28" | "29" | "3" | "4" | "5"}${string}`;
					}
					? "double"
					: "float"
				: "float"
			: W;
type CastLength<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? T[Nx<I>] extends { readonly k: "n" }
			? Expect<T, Nx<Nx<I>>, ")">
			: SyntaxErr<T, Nx<I>>
		: I;
type CastArgs<T extends Toks, I extends number> =
	TypeArgs<T, I> extends infer A
		? A extends Ok<unknown, infer J extends number>
			? J
			: A
		: never;
type SkipCharset<T extends Toks, I extends number> =
	IsWord<T, I, "character"> extends true
		? IsWord<T, Nx<I>, "set"> extends true
			? Nx<Nx<Nx<I>>>
			: I
		: IsWord<T, I, "charset"> extends true
			? Nx<Nx<I>>
			: IsWord<T, I, "ascii" | "unicode" | "binary"> extends true
				? Nx<I>
				: I;
