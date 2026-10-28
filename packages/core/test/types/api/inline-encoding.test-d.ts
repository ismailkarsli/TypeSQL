import { expectTypeOf, test } from "vitest";
import type {
	CheckCarried,
	CheckEnc,
	DescribeEnc,
	Enc,
	Opaque,
	RewriteInlineStr,
	SplitFirst,
	ValueEnc,
} from "../../../src/engine/inline.js";
import type { DefaultTypeMap, SqlError } from "../../../src/index.js";
import type { DB } from "../_schema.js";

// The encoding of inline values (`sql.param()`, `sql.json()`) and its checks (engine/inline.ts).

test("Enc: a flag per member of the value's type", () => {
	expectTypeOf<
		[
			Enc<any>,
			Enc<unknown>,
			Enc<"a" | 42>,
			Enc<boolean | bigint | null | undefined>,
			Enc<Date | Uint8Array | { a: 1 } | (() => void)>,
			Enc<(number | null)[]>,
			Enc<string[][]>,
		]
	>().toEqualTypeOf<["*", "*", "sn", "bi0u", "dyo", "[n0]", "[[s]]"]>();
	// a marker stands for the value it wraps
	expectTypeOf<
		[
			ValueEnc<any>,
			ValueEnc<"a">,
			ValueEnc<"\u0000PJn\u0000">,
			ValueEnc<"\u0000Dus\u0000" | 1>,
			ValueEnc<"\u0000x\u0000">,
		]
	>().toEqualTypeOf<["*", "s", "Jn", "s" | "n", "*"]>();
});

test("CheckEnc: every flag needs an overlapping member; arrays element by element", () => {
	expectTypeOf<
		[
			CheckEnc<"s", unknown>,
			CheckEnc<"", never>,
			CheckEnc<"*", number>,
			CheckEnc<"s", string>,
			CheckEnc<"s", number>,
			CheckEnc<"b", boolean>,
			CheckEnc<"b", string>,
			CheckEnc<"i", bigint>,
			CheckEnc<"i", number>,
			CheckEnc<"0", string | null>,
			CheckEnc<"u", string | null>,
			CheckEnc<"u", string>,
			CheckEnc<"d", Date>,
			CheckEnc<"d", string>,
			CheckEnc<"y", Uint8Array>,
			CheckEnc<"y", string>,
			CheckEnc<"o", { a: 1 }>,
			CheckEnc<"o", string>,
			CheckEnc<"z", never>,
		]
	>().toEqualTypeOf<
		[
			true,
			true,
			true,
			true,
			false,
			true,
			false,
			true,
			false,
			true,
			true,
			false,
			true,
			false,
			true,
			false,
			true,
			false,
			true,
		]
	>();
	expectTypeOf<
		[
			CheckEnc<"[s]", string[]>,
			CheckEnc<"[s]", number>,
			CheckEnc<"[s]", number[]>,
			CheckEnc<"[s]0", string[] | null>,
			CheckEnc<"[s]0", string[]>,
			CheckEnc<"[[n]]", number[][]>,
			CheckEnc<"[s", string[]>,
		]
	>().toEqualTypeOf<[true, false, false, true, false, true, false]>();
});

test("DescribeEnc: the TS type an encoding stands for", () => {
	expectTypeOf<
		[
			DescribeEnc<"s">,
			DescribeEnc<"n0">,
			DescribeEnc<"bi0udyo">,
			DescribeEnc<"z">,
			DescribeEnc<"[s]">,
			DescribeEnc<"[sn]0">,
			DescribeEnc<"[[s]]">,
			DescribeEnc<"">,
			DescribeEnc<"[s">,
		]
	>().toEqualTypeOf<
		[
			"string",
			"number | null",
			"boolean | bigint | null | undefined | Date | Uint8Array | object",
			"unknown",
			"string[]",
			"(string | number)[] | null",
			"string[][]",
			"never",
			"never",
		]
	>();
});

test("SplitFirst / Opaque: the code before the first quote or comment, and the quoted part", () => {
	expectTypeOf<
		[
			SplitFirst<"a 'b' c">,
			SplitFirst<'a "b" c'>,
			SplitFirst<"a -- b">,
			SplitFirst<"a /* b */">,
			SplitFirst<"abc">,
			// the earliest opener wins, whichever comes first in the text
			SplitFirst<"a -- b \"c 'd'">,
			SplitFirst<"a \"x\" -- y 'b'">,
			SplitFirst<"a /* x */ \"y\" 'b'">,
			SplitFirst<'a -- x "y"'>,
			SplitFirst<'a /* x */ "y"'>,
			SplitFirst<'a "x" /* y */'>,
		]
	>().toEqualTypeOf<
		[
			["a ", "'", "b' c"],
			["a ", '"', 'b" c'],
			["a ", "--", " b"],
			["a ", "/*", " b */"],
			["abc", "", ""],
			["a ", "--", " b \"c 'd'"],
			["a ", '"', "x\" -- y 'b'"],
			["a ", "/*", " x */ \"y\" 'b'"],
			["a ", "--", ' x "y"'],
			["a ", "/*", ' x */ "y"'],
			["a ", '"', 'x" /* y */'],
		]
	>();
	expectTypeOf<
		[
			Opaque<"'", "a''b' c">,
			Opaque<'"', 'a" c'>,
			Opaque<"'", "abc">,
			Opaque<"--", " x\n y">,
			Opaque<"--", " x">,
			Opaque<"/*", " x */ y">,
			Opaque<"/*", " x">,
			Opaque<"", "x">,
		]
	>().toEqualTypeOf<
		[
			["a''b'", " c"],
			['a"', " c"],
			["abc", ""],
			[" x\n", " y"],
			[" x", ""],
			[" x */", " y"],
			[" x", ""],
			["", "x"],
		]
	>();
});

test("RewriteInlineStr: markers become $n after the statement's own; not inside quotes or comments", () => {
	expectTypeOf<
		RewriteInlineStr<"SELECT \u0000Ps\u0000, 'x', \u0000Dun\u0000", 2>
	>().toEqualTypeOf<["SELECT $3, 'x', $4", ["s", "n"]]>();
	expectTypeOf<
		[
			RewriteInlineStr<"SELECT '\u0000Ps\u0000'", 0>,
			RewriteInlineStr<'SELECT "\u0000Ps\u0000"', 0>,
			RewriteInlineStr<"SELECT 1 -- \u0000Ps\u0000", 0>,
			RewriteInlineStr<"SELECT 1 /* \u0000Ps\u0000 */", 0>,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				"sql.param() cannot be used inside a quoted string; remove the surrounding quotes",
				null
			>,
			SqlError<
				"sql.param() cannot be used inside a quoted identifier; remove the surrounding quotes",
				null
			>,
			SqlError<
				"sql.param() cannot be used inside a comment; remove the surrounding comment",
				null
			>,
			SqlError<
				"sql.param() cannot be used inside a comment; remove the surrounding comment",
				null
			>,
		]
	>();
});

test("CheckCarried: carried values against the statement's parameters", () => {
	type C<X extends string, K extends readonly unknown[]> = CheckCarried<
		DB,
		DefaultTypeMap,
		X,
		K
	>;
	expectTypeOf<
		[
			C<"SELECT $1::int4", []>,
			C<"SELECT $1::int4", string[]>,
			C<"SELECT 1 FROM things WHERE id = $1", ["n"]>,
			// a call argument (null) is checked by the signature
			C<"SELECT 1 FROM things WHERE id = $1 AND label = $2", [null, "s"]>,
			C<"SELECT 1 FROM things WHERE nums = $1", ["[n]"]>,
			C<"SELECT 1 FROM things WHERE doc = $1", ["Jo"]>,
			// sql.json() for a parameter without context, or one of unknown type
			C<"SELECT $1, $2", ["Js", "Jn"]>,
			C<"SELECT ROW($1)", ["Js"]>,
			C<"SELECT coalesce($1, NULL)", ["Js"]>,
		]
	>().toEqualTypeOf<[true, true, true, true, true, true, true, true, true]>();
	expectTypeOf<
		[
			C<"SELECT 1 FROM things WHERE id = $1", ["s"]>,
			C<"SELECT 1 FROM things WHERE id = $1 AND label = $2", [null, "n"]>,
			C<"SELECT 1 FROM things WHERE doc = $1", ["[s]"]>,
			C<"SELECT 1 FROM things WHERE data = $1", ["[s]"]>,
			C<"SELECT 1 FROM things WHERE id = $1", ["Js"]>,
		]
	>().toEqualTypeOf<
		[
			SqlError<"parameter $1: a string value cannot be used as int4", 7>,
			SqlError<"parameter $2: a number value cannot be used as text", 11>,
			SqlError<
				"parameter $1: an array for json must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)",
				7
			>,
			SqlError<
				"parameter $1: an array for jsonb must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)",
				7
			>,
			SqlError<"parameter $1: a sql.json() value cannot be used as int4", 7>,
		]
	>();
});
