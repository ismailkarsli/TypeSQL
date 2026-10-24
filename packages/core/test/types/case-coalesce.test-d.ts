import { expectTypeOf, test } from "vitest";
import type { Row } from "./_schema.js";

// CASE / COALESCE / NULLIF / GREATEST / LEAST, verified against PostgreSQL 18.
// Common-type resolution follows the implicit cast chain int2 → int4 → int8 → numeric → float4 → float8,
// date → timestamp → timestamptz; an untyped literal yields to the other branch.

test("CASE: common type of the branches", () => {
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN 1 ELSE 2 END AS a, CASE WHEN flag THEN 1 ELSE 2.5 END AS b, CASE WHEN flag THEN small ELSE id END AS c, CASE WHEN flag THEN score ELSE id END AS d, CASE WHEN flag THEN 'a' ELSE label END AS e, CASE WHEN flag THEN 1 ELSE '2' END AS f FROM things">>()
    .toEqualTypeOf<{ a: number; b: string; c: number; d: number; e: string; f: number }>();
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN day ELSE at END AS a, CASE WHEN flag THEN ts ELSE day END AS b, CASE WHEN flag THEN big ELSE id END AS c, CASE WHEN flag THEN vc ELSE label END AS d, CASE WHEN flag THEN nums ELSE ARRAY[1] END AS e, CASE WHEN flag THEN mood ELSE 'sad' END AS f FROM things">>()
    .toEqualTypeOf<{ a: Date; b: Date; c: string; d: string; e: number[]; f: "happy" | "sad" }>();
  expectTypeOf<Row<"SELECT CASE id WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'many' END AS a, CASE WHEN flag THEN CASE WHEN flag THEN 1 END ELSE 2 END AS b, CASE WHEN flag THEN 1 WHEN n_flag THEN 2 ELSE 3 END AS c FROM things">>()
    .toEqualTypeOf<{ a: string; b: number | null; c: number }>();
  // incompatible branches are unknown, never an error (a string literal coerces, a text value does not)
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN 1 ELSE 'x'::text END AS a, CASE WHEN flag THEN day ELSE flag END AS b, coalesce(id, label) AS c, CASE WHEN flag THEN 1 ELSE label END AS d FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: unknown; c: unknown; d: unknown }>();
});

test("CASE nullability: missing ELSE or a nullable branch", () => {
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN 1 END AS a, CASE WHEN flag THEN 1 ELSE NULL END AS b, CASE WHEN flag THEN n_id ELSE 1 END AS c, CASE WHEN flag THEN 1 ELSE 2 END AS d, CASE WHEN n_flag THEN 1 ELSE 2 END AS e, CASE n_id WHEN 1 THEN 'a' ELSE 'b' END AS f FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: number | null; c: number | null; d: number; e: number; f: string }>();
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN NULL END AS a FROM things">>().toEqualTypeOf<{ a: null }>();
});

test("COALESCE: common type, nullable only if every argument is", () => {
  expectTypeOf<Row<"SELECT coalesce(n_text, 'x') AS a, coalesce(n_text, n_text) AS b, coalesce(n_id, n_big) AS c, coalesce(n_id, 0) AS d, coalesce(n_price, id) AS e, coalesce(n_at, day) AS f, coalesce(NULL, n_id) AS g, coalesce(n_nums, ARRAY[1]) AS h FROM things">>()
    .toEqualTypeOf<{ a: string; b: string | null; c: string | null; d: number; e: string; f: Date; g: number | null; h: number[] }>();
  expectTypeOf<Row<"SELECT coalesce(n_id) AS a, coalesce(1, 2.5) AS b, coalesce('a', 'b') AS c, coalesce(NULL, NULL) AS d, coalesce(score, id) AS e, coalesce(n_mood, 'happy') AS f FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: string; c: string; d: null; e: number; f: "happy" | "sad" }>();
  // outer join: COALESCE is the idiomatic way back to non-null
  expectTypeOf<Row<"SELECT coalesce(p.title, '') AS t, coalesce(p.author_id, u.id) AS a FROM users u LEFT JOIN posts p ON p.author_id = u.id">>()
    .toEqualTypeOf<{ t: string; a: number }>();
});

test("NULLIF is always nullable with the common type; GREATEST/LEAST ignore NULLs", () => {
  expectTypeOf<Row<"SELECT nullif(id, 1) AS a, nullif(label, 'x') AS b, nullif(id, 2.5) AS c, nullif(n_id, 1) AS d, nullif(small, id) AS e FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: string | null; c: string | null; d: number | null; e: number | null }>();
  expectTypeOf<Row<"SELECT greatest(id, 2) AS a, greatest(n_id, id) AS b, greatest(n_id, n_big) AS c, least(id, 2.5) AS d, least(day, at) AS e, greatest(label, n_text) AS f, least(n_id) AS g FROM things">>()
    .toEqualTypeOf<{ a: number; b: number; c: string | null; d: string; e: Date; f: string; g: number | null }>();
});

test("column names", () => {
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN 1 END, coalesce(n_id, 0), nullif(id, 1), greatest(id, 1), least(id, 1) FROM things">>()
    .toEqualTypeOf<{ case: number | null; coalesce: number; nullif: number | null; greatest: number; least: number }>();
});
