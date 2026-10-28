import { expectTypeOf, test } from "vitest";
import type { Col, DefaultTypeMap, RowOf } from "../../src/index.js";

// These probe compiler recursion beyond PostgreSQL's 63-byte identifier limit.
// They are compiler capacity coverage, rather than SQL server conformance assertions.
interface DB {
	items: { id: Col<"int4"> };
}
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;

type TenLetters = "aaaaaaaaaa";
type HundredLetters =
	`${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}`;
type ThousandLetters =
	`${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}`;
type NineHundredLetters =
	`${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}`;
type NinetySevenLetters =
	`${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}${TenLetters}aaaaaaa`;
type LongBareAlias =
	`${ThousandLetters}${ThousandLetters}${ThousandLetters}${NineHundredLetters}${NinetySevenLetters}`;
type LongQuotedAlias =
	`${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}${HundredLetters}`;

test("long identifiers retain general parser recursion capacity", () => {
	expectTypeOf<
		Row<`SELECT "${LongQuotedAlias}".id FROM items AS "${LongQuotedAlias}"`>
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<`SELECT ${LongBareAlias}.id FROM items AS ${LongBareAlias}`>
	>().toEqualTypeOf<{ id: number }>();
});
