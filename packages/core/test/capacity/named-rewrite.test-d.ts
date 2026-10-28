import { expectTypeOf, test } from "vitest";
import type { RewriteNamedStr } from "../../src/engine/named.js";
import type { DefaultTypeMap, RowOf } from "../../src/index.js";

type TenPairs = "::::::::::::::::::::";
type HundredPairs =
	`${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}${TenPairs}`;
type ThousandPairs =
	`${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}${HundredPairs}`;
type ManyPairs = `${ThousandPairs}${HundredPairs}`;
type Quoted = `SELECT '${ManyPairs}' AS value`;
type Comment = `SELECT 1 /* ${ManyPairs} */ AS value`;
type Named = `SELECT '${ManyPairs}' AS value, :id::int4 AS id`;

test("cast-pair screening preserves opaque text beyond the recursion budget", () => {
	expectTypeOf<RewriteNamedStr<Quoted>>().toEqualTypeOf<[Quoted, []]>();
	expectTypeOf<RewriteNamedStr<Comment>>().toEqualTypeOf<[Comment, []]>();
	expectTypeOf<RewriteNamedStr<Named>>().toEqualTypeOf<
		[`SELECT '${ManyPairs}' AS value, $1::int4 AS id`, ["id"]]
	>();
	expectTypeOf<
		RowOf<Record<never, never>, DefaultTypeMap, Quoted>
	>().toEqualTypeOf<{
		value: string;
	}>();
	expectTypeOf<
		RowOf<Record<never, never>, DefaultTypeMap, Comment>
	>().toEqualTypeOf<{
		value: number;
	}>();
});
