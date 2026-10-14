import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// VALUES lists, verified against PostgreSQL 17.

test("standalone VALUES: column1, column2, ... with common types", () => {
  expectTypeOf<Row<"VALUES (1, 'a'), (2, 'b')">>().toEqualTypeOf<{ column1: number; column2: string }>();
  expectTypeOf<Row<"VALUES (1, 2.5), (3, 4)">>().toEqualTypeOf<{ column1: number; column2: string }>();
  expectTypeOf<Row<"VALUES (1::int8), (2::int4)">>().toEqualTypeOf<{ column1: string }>();
  // untyped literals take the other rows' type
  expectTypeOf<Row<"VALUES (1), ('2')">>().toEqualTypeOf<{ column1: number }>();
  expectTypeOf<Row<"VALUES ('1')">>().toEqualTypeOf<{ column1: string }>();
  expectTypeOf<Row<"VALUES (now()), ('2020-01-01')">>().toEqualTypeOf<{ column1: Date }>();
  expectTypeOf<Row<"VALUES (1) ORDER BY 1 LIMIT 1">>().toEqualTypeOf<{ column1: number }>();
  expectTypeOf<Row<"VALUES (1, 2) ORDER BY column2, column1 + 1">>().toEqualTypeOf<{ column1: number; column2: number }>();
});

test("a column is nullable if any row has NULL (or a nullable expression) there", () => {
  expectTypeOf<Row<"VALUES (1, 'a'), (NULL, 'b')">>().toEqualTypeOf<{ column1: number | null; column2: string }>();
  expectTypeOf<Row<"VALUES (NULL), (1)">>().toEqualTypeOf<{ column1: number | null }>();
  expectTypeOf<Row<"SELECT * FROM users u, LATERAL (VALUES (u.id), (u.display_name::int4)) v(x)">>()
    .toEqualTypeOf<{ id: number; email: string; display_name: string | null; created_at: Date; x: number | null }>();
});

test("VALUES in FROM with a column alias list", () => {
  expectTypeOf<Row<"SELECT * FROM (VALUES (1, 'a'), (2, NULL)) AS v(a, b)">>().toEqualTypeOf<{ a: number; b: string | null }>();
  expectTypeOf<Row<"SELECT v.a FROM (VALUES (1, 'a')) AS v(a)">>().toEqualTypeOf<{ a: number }>();
  expectTypeOf<Row<"SELECT * FROM (VALUES (1, 'a')) AS v(a)">>().toEqualTypeOf<{ a: number; column2: string }>();
  expectTypeOf<Row<"SELECT * FROM (VALUES (1, 'a')) v">>().toEqualTypeOf<{ column1: number; column2: string }>();
  expectTypeOf<Row<"SELECT * FROM (VALUES (1, 'a'))">>().toEqualTypeOf<{ column1: number; column2: string }>();
  expectTypeOf<Row<"SELECT * FROM (VALUES (1)) v, LATERAL (SELECT v.column1 + 1 AS n) s">>().toEqualTypeOf<{ column1: number; n: number }>();
});

test("VALUES errors", () => {
  expectTypeOf<V<"VALUES (1, 2), (3)">>().toEqualTypeOf<SqlError<"VALUES lists must all be the same length", 0>>();
  expectTypeOf<V<"VALUES (1), ('a'::text)">>().toEqualTypeOf<SqlError<"VALUES types integer and text cannot be matched", 0>>();
  expectTypeOf<V<"VALUES (1) ORDER BY 2">>().toEqualTypeOf<SqlError<"ORDER BY position 2 is not in select list", 0>>();
  expectTypeOf<V<"VALUES (nope)">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 2>>();
  expectTypeOf<V<"SELECT * FROM (VALUES (1, 'a')) AS v(a, b, c)">>().toEqualTypeOf<SqlError<'table "v" has 2 columns available but 3 columns specified', 12>>();
});
