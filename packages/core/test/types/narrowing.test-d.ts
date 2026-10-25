import { expectTypeOf, test } from "vitest";
import type { Analyze } from "../../src/engine/index.js";
import type { DB, Row } from "./_schema.js";

// WHERE / JOIN ON narrowing (binder/narrow.ts): a conjunct that is TRUE only when a column is
// non-null makes the column non-null. Every statement was checked against PostgreSQL 18.
type X<Q extends string> = Row<Q>["x"];
/** Nullability of the first column (for jsonb, whose row type `unknown` hides it). */
type N<Q extends string> =
	Analyze<DB, Q> extends {
		readonly cols: readonly [{ readonly t: { readonly nullable: infer B } }];
	}
		? B
		: "error";

test("every strict boolean operator narrows both operands", () => {
	expectTypeOf<
		[
			X<"SELECT n_id AS x FROM things WHERE n_id < 1">,
			X<"SELECT n_id AS x FROM things WHERE n_id > 1">,
			X<"SELECT n_id AS x FROM things WHERE n_id <= 1">,
			X<"SELECT n_id AS x FROM things WHERE n_id >= 1">,
			X<"SELECT n_id AS x FROM things WHERE n_id <> 1">,
			X<"SELECT n_id AS x FROM things WHERE n_id != 1">,
			X<"SELECT n_id AS x FROM things WHERE 1 < n_id">,
		]
	>().toEqualTypeOf<[number, number, number, number, number, number, number]>();
	expectTypeOf<
		[
			X<"SELECT n_text AS x FROM things WHERE n_text ~ 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text ~* 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text !~ 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text !~* 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text ~~ 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text ~~* 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text !~~ 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text !~~* 'a'">,
			X<"SELECT n_text AS x FROM things WHERE n_text @@ 'a'">,
		]
	>().toEqualTypeOf<
		[string, string, string, string, string, string, string, string, string]
	>();
	expectTypeOf<
		[
			X<"SELECT n_nums AS x FROM things WHERE n_nums @> '{1}'">,
			X<"SELECT n_nums AS x FROM things WHERE n_nums <@ '{1}'">,
			X<"SELECT n_nums AS x FROM things WHERE n_nums && '{1}'">,
		]
	>().toEqualTypeOf<[number[], number[], number[]]>();
	expectTypeOf<
		[
			N<"SELECT n_data FROM things WHERE n_data ? 'a'">,
			N<"SELECT n_data FROM things WHERE n_data ?| '{a}'">,
			N<"SELECT n_data FROM things WHERE n_data ?& '{a}'">,
			N<"SELECT n_data FROM things WHERE n_data @? '$.a'">,
			N<"SELECT n_data FROM things WHERE n_data IS NULL">,
		]
	>().toEqualTypeOf<[false, false, false, false, true]>();
});

test("a boolean column, IS TRUE / IS FALSE, IN (subquery), COLLATE", () => {
	expectTypeOf<
		[
			X<"SELECT n_flag AS x FROM things WHERE n_flag">,
			X<"SELECT n_flag AS x FROM things WHERE n_flag IS TRUE">,
			X<"SELECT n_flag AS x FROM things WHERE n_flag IS FALSE">,
			X<"SELECT n_id AS x FROM things WHERE n_id IN (SELECT id FROM things)">,
			X<"SELECT n_text AS x FROM things WHERE n_text COLLATE \"C\" = 'a'">,
		]
	>().toEqualTypeOf<[boolean, boolean, boolean, number, string]>();
});

test("what does not narrow: IS NOT TRUE / FALSE, OR, a column hidden by USING", () => {
	expectTypeOf<
		[
			X<"SELECT n_flag AS x FROM things WHERE n_flag IS NOT TRUE">,
			X<"SELECT n_flag AS x FROM things WHERE n_flag IS NOT FALSE">,
			X<"SELECT n_flag AS x FROM things WHERE n_flag OR true">,
			X<"SELECT n_flag AS x FROM things WHERE n_flag IS UNKNOWN">,
			// the bare name is the merged column (COALESCE in a FULL join), not a's
			X<"SELECT a.n_id AS x FROM things a FULL JOIN things b USING (n_id) WHERE n_id IS NOT NULL">,
		]
	>().toEqualTypeOf<
		[
			boolean | null,
			boolean | null,
			boolean | null,
			boolean | null,
			number | null,
		]
	>();
});
