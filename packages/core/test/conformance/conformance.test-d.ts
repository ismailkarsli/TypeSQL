import { expectTypeOf, test } from "vitest";
import type { DefaultTypeMap, RowOf } from "../../src/index.js";
import type { ConformanceDB, TypeofName, corpus } from "./corpus.js";

/**
 * Compile-time half of the conformance corpus. For every entry:
 *   - `keyof RowOf<ConformanceDB, DefaultTypeMap, sql>` must equal the union of `expectKeys`;
 *   - the `typeof` category recorded in `expectTypes` must be one the inferred TS type can
 *     produce (`string | null` admits "string" and "null"; `unknown` admits anything).
 * `Report` is a per-case object so a failure names the case, the column and the inferred type.
 */

type Cases = typeof corpus;
type Case = Cases[number];
type Row<C extends Case> = RowOf<ConformanceDB, DefaultTypeMap, C["sql"]>;
type Keys<C extends Case> = C["expectKeys"][number];

/** typeof categories a TS type can produce at runtime (distributes over unions). */
type Categories<T> = [unknown] extends [T]
  ? TypeofName
  : T extends string ? "string"
  : T extends number ? "number"
  : T extends boolean ? "boolean"
  : T extends bigint ? "bigint"
  : T extends null ? "null"
  : T extends object ? "object"
  : never;

type KeysReport<C extends Case> =
  [keyof Row<C>] extends [Keys<C>]
    ? [Keys<C>] extends [keyof Row<C>] ? true : { missingFromRow: Exclude<Keys<C>, keyof Row<C>> }
    : { notInExpectKeys: Exclude<keyof Row<C>, Keys<C>> };

type TypeMismatches<C extends Case> = {
  [K in Keys<C> & keyof Row<C> & keyof C["expectTypes"]]: C["expectTypes"][K] extends Categories<Row<C>[K]>
    ? never
    : { column: K; expected: C["expectTypes"][K]; inferred: Row<C>[K] };
}[Keys<C> & keyof Row<C> & keyof C["expectTypes"]];

type Report = {
  [C in Case as C["name"]]: {
    keys: KeysReport<C>;
    types: [TypeMismatches<C>] extends [never] ? true : TypeMismatches<C>;
  };
};
type AllGood = { [C in Case as C["name"]]: { keys: true; types: true } };

test("every corpus entry's inferred row matches expectKeys and expectTypes", () => {
  expectTypeOf<Report>().toEqualTypeOf<AllGood>();
});
