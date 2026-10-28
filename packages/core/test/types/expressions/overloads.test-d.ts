import { expectTypeOf, test } from "vitest";
import type { Analyze } from "../../../src/engine/index.js";
import type { MatchKind } from "../../../src/engine/typer/catalog.js";
import type { Sig } from "../../../src/index.js";
import type { DB } from "../_schema.js";

// Overload resolution reads a call's argument types against each signature's parameters
// (`MatchKind`): "x" an exact match, "c" an implicit cast (close to PostgreSQL's `pg_cast` with
// castcontext 'i'), false none. The functions oracle checks the picks against PostgreSQL; these
// pin each rule, with an argument it takes and one it does not.

type K<P extends string, A extends string> = MatchKind<P, A>;

test("untyped arguments: unknown and NULL fit anything; a string literal is exact for a string parameter", () => {
	expectTypeOf<
		[
			K<"int4", "unknown">,
			K<"int4", "null">,
			K<"text", "lit">,
			K<"anystring", "lit">,
			K<"varchar", "lit">,
			K<"int4", "lit">,
		]
	>().toEqualTypeOf<["c", "c", "x", "x", "x", "c"]>();
});

test("polymorphic parameters take their family exactly", () => {
	expectTypeOf<
		[
			K<"any", "bool">,
			K<"...", "bool">,
			K<"anynumeric", "numeric">,
			K<"anynumeric", "bool">,
			K<"anystring", "citext">,
			K<"anystring", "int4">,
			K<"anyarray", "int4[]">,
			K<"anyarray", "int4">,
			K<"anyjson", "jsonb">,
			K<"anyjson", "bool">,
			K<"anydatetime", "timestamptz">,
			K<"anydatetime", "bool">,
			K<"anyrange", "int4range">,
			K<"anyrange", "int4">,
		]
	>().toEqualTypeOf<
		[
			"c",
			"c",
			"x",
			false,
			"x",
			false,
			"x",
			false,
			"x",
			false,
			"x",
			false,
			"x",
			false,
		]
	>();
});

test("exact types, text (string literals outside the typer) and arrays element-wise", () => {
	expectTypeOf<
		[
			K<"bool", "bool">,
			K<"bool", "text">,
			K<"int8[]", "int4[]">,
			K<"int4[]", "bool[]">,
			K<"int4[]", "int4">,
			K<"bool", "int4">,
		]
	>().toEqualTypeOf<["x", "c", "c", false, false, false]>();
});

test("numeric widening: int2 → int4 → int8 → numeric → float4 → float8", () => {
	expectTypeOf<
		[
			K<"int4", "int2">,
			K<"int4", "int8">,
			K<"int8", "int2">,
			K<"int8", "int4">,
			K<"int8", "numeric">,
			K<"numeric", "int2">,
			K<"numeric", "int4">,
			K<"numeric", "int8">,
			K<"numeric", "float4">,
			K<"float4", "int8">,
			K<"float4", "numeric">,
			K<"float4", "float8">,
			K<"float8", "int2">,
			K<"float8", "numeric">,
			K<"float8", "float4">,
			K<"float8", "bool">,
		]
	>().toEqualTypeOf<
		[
			"c",
			false,
			"c",
			"c",
			false,
			"c",
			"c",
			"c",
			false,
			"c",
			"c",
			false,
			"c",
			"c",
			"c",
			false,
		]
	>();
});

test("strings, date/time, inet and the reg* types", () => {
	expectTypeOf<
		[
			K<"text", "varchar">,
			K<"varchar", "bpchar">,
			K<"bpchar", "varchar">,
			K<"varchar", "int4">,
			K<"timestamptz", "date">,
			K<"timestamptz", "timestamp">,
			K<"timestamptz", "time">,
			K<"timestamp", "date">,
			K<"timestamp", "timestamptz">,
			K<"timetz", "time">,
			K<"timetz", "date">,
			K<"interval", "time">,
			K<"interval", "date">,
			K<"inet", "cidr">,
			K<"inet", "int4">,
		]
	>().toEqualTypeOf<
		[
			"c",
			"c",
			"c",
			false,
			"c",
			"c",
			false,
			"c",
			false,
			"c",
			false,
			"c",
			false,
			"c",
			false,
		]
	>();
	expectTypeOf<
		[
			K<"oid", "int4">,
			K<"regclass", "int8">,
			K<"regtype", "int2">,
			K<"regproc", "int4">,
			K<"regconfig", "int4">,
			K<"regclass", "bool">,
		]
	>().toEqualTypeOf<["c", "c", "c", "c", "c", false]>();
});

/** Made-up signatures, to reach each rule of the resolution and of the `$…` return types. */
interface FnDB extends DB {
	$functions: {
		typed_or_any: [Sig<["bool", "bool"], "bool">, Sig<["..."], "int4">];
		one_bool: Sig<["bool"], "bool">;
		two_bools_and_more: Sig<["bool", "bool", "..."], "bool">;
		second: Sig<["..."], "$2">;
		third: Sig<["..."], "$3">;
		fourth: Sig<["..."], "$4">;
		elem: Sig<["..."], "$elem1">;
		arr: Sig<["..."], "$arr1">;
		range_elem: Sig<["..."], "$rangeelem1">;
		multirange: Sig<["..."], "$multirange1">;
		lax: Sig<[], "int4", { strict: false }>;
	};
}
/** Postgres type of each column. */
type Types<Q extends string> =
	Analyze<FnDB, Q> extends {
		readonly cols: infer C extends readonly {
			readonly t: { readonly type: string };
		}[];
	}
		? { -readonly [K in keyof C]: C[K]["t"]["type"] }
		: Analyze<FnDB, Q>;

test("an overload that fits by type wins; without one, the first that fits by arity", () => {
	expectTypeOf<
		Types<"SELECT typed_or_any(id, id), one_bool(id), one_bool(id, id), two_bools_and_more(id, id, id, id), two_bools_and_more(id) FROM things">
	>().toEqualTypeOf<["int4", "bool", "unknown", "bool", "unknown"]>();
});

test("return types taken from the arguments", () => {
	expectTypeOf<
		Types<"SELECT second(id), second(id, label), third(id, label, flag), fourth(id, label, flag, day) FROM things">
	>().toEqualTypeOf<["unknown", "text", "bool", "date"]>();
	// element of an array, range of a multirange
	expectTypeOf<
		Types<"SELECT elem(nums), elem('{}'::int4multirange), elem(id) FROM things">
	>().toEqualTypeOf<["int4", "int4range", "unknown"]>();
	// no arrays of arrays; an untyped argument gives unknown[]
	expectTypeOf<
		Types<"SELECT arr(id), arr(nums), arr(NULL), arr($1) FROM things">
	>().toEqualTypeOf<["int4[]", "int4[]", "unknown[]", "unknown[]"]>();
	expectTypeOf<
		Types<"SELECT range_elem('{}'::datemultirange), range_elem('[1,2)'::int8range), range_elem('{}'::mymultirange), range_elem('[1,2)'::myrange), range_elem(id) FROM things">
	>().toEqualTypeOf<["date", "int8", "unknown", "unknown", "unknown"]>();
	expectTypeOf<
		Types<"SELECT multirange('{}'::nummultirange), multirange('[1,2)'::numrange), multirange(id) FROM things">
	>().toEqualTypeOf<["nummultirange", "nummultirange", "unknown"]>();
});

test("a call no overload fits may return NULL; a function that is not strict and takes no arguments may too", () => {
	type Nullable<Q extends string> =
		Analyze<FnDB, Q> extends {
			readonly cols: readonly [{ readonly t: { readonly nullable: infer N } }];
		}
			? N
			: never;
	expectTypeOf<Nullable<"SELECT lax()">>().toEqualTypeOf<true>();
	expectTypeOf<Nullable<"SELECT one_bool(1, 2)">>().toEqualTypeOf<true>();
});
