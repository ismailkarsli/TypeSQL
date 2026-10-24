import { expectTypeOf, test } from "vitest";
import type {
	DefaultTypeMap,
	ParamsOf,
	RowOf,
	Sig,
	SqlError,
	Validate,
} from "../../src/index.js";
import type { DB, Row, V } from "./_schema.js";

/**
 * `FunctionCatalog` is an augmentable interface. In an application the module specifier is
 * the package name:
 *
 *   declare module "@typesql/core" {
 *     interface FunctionCatalog { my_fn: Sig<["text"], "int8"> }
 *   }
 *
 * Tests import the sources by relative path, so the augmentation targets that path. Both
 * the re-exporting module (`index.ts`) and `engine/typer/catalog.ts` itself work as targets.
 * Only new names may be added here: this augmentation applies to the whole test program.
 */
declare module "../../src/index.js" {
	interface FunctionCatalog {
		aug_len: Sig<["text"], "int8">;
		aug_sum: Sig<["anynumeric"], "numeric", { agg: true }>;
		aug_series: Sig<["int4"], "text", { srf: true }>;
		aug_over: [Sig<["int4"], "int4">, Sig<["text"], "text">];
		aug_nn: Sig<["any"], "bool", { nullable: false }>;
		aug_first: Sig<["text", "text"], "text", { strict: [1] }>;
		aug_win: Sig<["any"], "$1", { window: true; nullable: true }>;
		aug_arr: Sig<["anyarray"], "$elem1">;
	}
}

test("augmented scalar functions, strictness and overloads", () => {
	expectTypeOf<
		Row<"SELECT aug_len(label) AS a, aug_len(n_text) AS b, aug_len('x') AS c FROM things">
	>().toEqualTypeOf<{ a: string; b: string | null; c: string }>();
	expectTypeOf<
		Row<"SELECT aug_over(id) AS a, aug_over(label) AS b, aug_over(small) AS c FROM things">
	>().toEqualTypeOf<{ a: number; b: string; c: number }>();
	expectTypeOf<
		Row<"SELECT aug_nn(n_text) AS a, aug_first(label, n_text) AS b, aug_first(n_text, label) AS c, aug_arr(nums) AS d, aug_arr(n_nums) AS e FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: string;
		c: string | null;
		d: number;
		e: number | null;
	}>();
	expectTypeOf<Row<"SELECT aug_len(label) FROM things">>().toEqualTypeOf<{
		aug_len: string;
	}>();
});

test("augmented aggregate, window and set-returning functions", () => {
	expectTypeOf<Row<"SELECT aug_sum(id) AS a FROM things">>().toEqualTypeOf<{
		a: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT aug_sum(id) AS a FROM things GROUP BY label">
	>().toEqualTypeOf<{ a: string }>();
	expectTypeOf<
		Row<"SELECT aug_sum(id) FILTER (WHERE flag) AS a, aug_sum(id) OVER () AS b FROM things GROUP BY id, flag">
	>().toEqualTypeOf<{ a: string | null; b: string }>();
	expectTypeOf<
		Row<"SELECT aug_win(id) OVER (ORDER BY id) AS a FROM things">
	>().toEqualTypeOf<{ a: number | null }>();
	expectTypeOf<Row<"SELECT s FROM aug_series(3) AS s">>().toEqualTypeOf<{
		s: string;
	}>();
});

test("functions outside the catalog are errors", () => {
	expectTypeOf<V<"SELECT not_in_catalog(id) FROM things">>().toEqualTypeOf<
		SqlError<
			"function not_in_catalog(int4) does not exist. Declare it in the schema's $functions or in FunctionCatalog",
			1
		>
	>();
});

/** App functions can live next to the tables, under `$functions` (same `Sig` notation). */
interface FnDB extends DB {
	$functions: {
		immutable_unaccent: Sig<["text"], "text">;
		app_series: Sig<["int4"], "int8", { srf: true }>;
		app_total: Sig<["anynumeric"], "numeric", { agg: true }>;
		/** overrides the generated pg_catalog entry (return type only, arguments unchecked) */
		pg_table_size: Sig<["regclass"], "int8", { nullable: false }>;
	};
}
type FRow<Q extends string> = RowOf<FnDB, DefaultTypeMap, Q>;

test("schema-level $functions", () => {
	expectTypeOf<
		FRow<"SELECT immutable_unaccent(label) AS a, public.immutable_unaccent(n_text) AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string | null }>();
	expectTypeOf<FRow<"SELECT n FROM app_series(3) AS n">>().toEqualTypeOf<{
		n: string;
	}>();
	expectTypeOf<
		FRow<"SELECT app_total(id) AS t FROM things GROUP BY label">
	>().toEqualTypeOf<{ t: string }>();
	expectTypeOf<
		FRow<"SELECT pg_table_size('things') AS s FROM things">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		ParamsOf<FnDB, DefaultTypeMap, "SELECT immutable_unaccent($1) AS a">
	>().toEqualTypeOf<[string | null]>();
	// the declared names feed the "did you mean" hint, and are scoped to their schema
	expectTypeOf<
		Validate<FnDB, "SELECT immutable_unaccnt(label) FROM things">
	>().toEqualTypeOf<
		SqlError<
			'function immutable_unaccnt(text) does not exist. Perhaps you meant the function "immutable_unaccent"? Otherwise declare it in the schema\'s $functions or in FunctionCatalog',
			1
		>
	>();
	expectTypeOf<
		V<"SELECT immutable_unaccent(label) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"function immutable_unaccent(text) does not exist. Declare it in the schema's $functions or in FunctionCatalog",
			1
		>
	>();
	// `$functions` is not a relation
	expectTypeOf<Validate<FnDB, "SELECT * FROM fnction">>().toEqualTypeOf<
		SqlError<'relation "fnction" does not exist', 3>
	>();
});
