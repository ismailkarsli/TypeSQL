import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// Whole-row references (a FROM item used as a value), verified against PostgreSQL 17.
// The value itself is a `record` (`unknown` under the default type map; pg and postgres.js
// return the text form "(1,ada@example.com,…)"); its columns are reachable with (t).col and (t).*,
// and to_json(t) is an object (json.test-d.ts).

test("a FROM item name used as a value is a whole-row reference", () => {
  expectTypeOf<Row<"SELECT u FROM users u">>().toEqualTypeOf<{ u: unknown }>();
  expectTypeOf<Row<"SELECT users FROM users">>().toEqualTypeOf<{ users: unknown }>();
  expectTypeOf<Row<"SELECT s FROM (SELECT id FROM users) s">>().toEqualTypeOf<{ s: unknown }>();
  type U = { id: number; email: string; display_name: string | null; created_at: string };
  expectTypeOf<Row<"SELECT to_json(u) AS a, row_to_json(u) AS b, to_jsonb(u.*) AS c FROM users u">>().toEqualTypeOf<{ a: U; b: U; c: U }>();
  expectTypeOf<Row<"SELECT json_agg(u) AS d FROM users u">>().toEqualTypeOf<{ d: U[] | null }>();
  // as a function argument, in count(t.*) and in GROUP BY
  expectTypeOf<Row<"SELECT count(u.*) AS n FROM users u">>().toEqualTypeOf<{ n: string }>();
  expectTypeOf<Row<"SELECT u.id FROM users u GROUP BY u">>().toEqualTypeOf<{ id: number }>();
});

test("columns win over FROM item names, at any query level", () => {
  // `s.u` is a column, so `u` is not the whole row of users u
  expectTypeOf<Row<"SELECT u FROM users u, (SELECT 1 AS u) s">>().toEqualTypeOf<{ u: number }>();
  // the outer column `x` wins over the inner FROM item `x`
  expectTypeOf<Row<"SELECT (SELECT x FROM users x LIMIT 1) AS v FROM (SELECT 1 AS x) o">>().toEqualTypeOf<{ v: number | null }>();
  // an outer FROM item is visible as a whole row from a correlated subquery
  expectTypeOf<Row<"SELECT (SELECT to_json(u)::text FROM posts p WHERE p.author_id = u.id LIMIT 1) AS j FROM users u">>().toEqualTypeOf<{ j: string | null }>();
});

test("(t).col and (t).* reach the row's columns", () => {
  expectTypeOf<Row<"SELECT (u).email, (u).display_name AS dn FROM users u">>().toEqualTypeOf<{ email: string; dn: string | null }>();
  expectTypeOf<Row<"SELECT (u).* FROM users u">>()
    .toEqualTypeOf<{ id: number; email: string; display_name: string | null; created_at: Date }>();
  expectTypeOf<Row<"SELECT (s).* FROM (SELECT id, email AS mail FROM users) s">>().toEqualTypeOf<{ id: number; mail: string }>();
  expectTypeOf<V<"SELECT (u).nope FROM users u">>().toEqualTypeOf<SqlError<'column "nope" not found in data type record', 5>>();
  expectTypeOf<V<"SELECT (ROW(1, 2)).*">>().toEqualTypeOf<SqlError<"(e).* needs a whole-row value such as (t).*", 0>>();
  expectTypeOf<V<"SELECT to_json((u).*) FROM users u">>().toEqualTypeOf<SqlError<"(e).* is only supported in a target list", 0>>();
});

test("the null-extended side of an outer join is a nullable row", () => {
  expectTypeOf<Row<"SELECT u IS NULL AS a, p IS NULL AS b, (p).title, (p).id FROM users u LEFT JOIN posts p ON p.author_id = u.id">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; title: string | null; id: string | null }>();
  expectTypeOf<Row<"SELECT (p).* FROM users u LEFT JOIN posts p ON p.author_id = u.id">>()
    .toEqualTypeOf<{ id: string | null; author_id: number | null; title: string | null; body: string | null; tags: string[] | null; meta: unknown }>();
  // WHERE p.id IS NOT NULL proves the row exists
  expectTypeOf<Row<"SELECT (p).title FROM users u LEFT JOIN posts p ON p.author_id = u.id WHERE p.id IS NOT NULL">>().toEqualTypeOf<{ title: string | null }>();
});

test("unknown names still fail", () => {
  expectTypeOf<V<"SELECT x FROM users u">>().toEqualTypeOf<SqlError<'column "x" does not exist', 1>>();
  expectTypeOf<V<"SELECT to_json(x.*) FROM users u">>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "x"', 3>>();
});
