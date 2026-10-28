import { expectTypeOf, test } from "vitest";
import type { Row } from "../_schema.js";

// Expression nullability rules, verified against PostgreSQL 18.

test("three-valued logic: AND/OR/NOT are nullable if an operand is; IS forms never are", () => {
	expectTypeOf<
		Row<"SELECT flag AND flag AS a, flag AND n_flag AS b, n_flag OR flag AS c, NOT flag AS d, NOT n_flag AS e, n_flag AND NULL AS f FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean | null;
		c: boolean | null;
		d: boolean;
		e: boolean | null;
		f: boolean | null;
	}>();
	expectTypeOf<
		Row<"SELECT n_id IS NULL AS a, n_id IS NOT NULL AS b, n_flag IS TRUE AS c, n_flag IS NOT FALSE AS d, n_flag IS UNKNOWN AS e, n_id ISNULL AS f, n_id NOTNULL AS g, n_id IS DISTINCT FROM 1 AS h, n_id IS NOT DISTINCT FROM n_big AS i, NULL IS NULL AS j FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
		h: boolean;
		i: boolean;
		j: boolean;
	}>();
});

test("strict operators and predicates propagate nullability from any operand", () => {
	expectTypeOf<
		Row<"SELECT n_id = 1 AS a, n_id + 1 AS b, n_text || 'x' AS c, n_text LIKE 'x' AS d, n_id BETWEEN 1 AND 2 AS e, id BETWEEN n_id AND 2 AS f FROM things">
	>().toEqualTypeOf<{
		a: boolean | null;
		b: number | null;
		c: string | null;
		d: boolean | null;
		e: boolean | null;
		f: boolean | null;
	}>();
	expectTypeOf<
		Row<"SELECT n_id IN (1, 2) AS a, id IN (1, n_id) AS b, n_id = ANY(nums) AS c, id = ANY(n_nums) AS d, -n_id AS e, n_id::text AS f, n_at AT TIME ZONE 'utc' AS g, EXTRACT(year FROM n_at) AS h FROM things">
	>().toEqualTypeOf<{
		a: boolean | null;
		b: boolean | null;
		c: boolean | null;
		d: boolean | null;
		e: number | null;
		f: string | null;
		g: Date | null;
		h: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT id = 1 AS a, id IN (1, 2) AS b, label LIKE 'x' AS c, id BETWEEN 1 AND 2 AS d, id = ANY(nums) AS e FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
	}>();
});

test("subqueries: scalar → nullable, EXISTS → not, IN (subquery) → follows both sides", () => {
	expectTypeOf<
		Row<"SELECT (SELECT id FROM users LIMIT 1) AS a, (SELECT count(*) FROM users) AS b, EXISTS (SELECT 1 FROM users) AS c, id IN (SELECT author_id FROM posts) AS d, id IN (SELECT n_id FROM things) AS e, ARRAY(SELECT n_id FROM things) AS f, n_id IN (SELECT id FROM users) AS g FROM things">
	>().toEqualTypeOf<{
		a: number | null;
		b: string | null;
		c: boolean;
		d: boolean;
		e: boolean | null;
		f: number[];
		g: boolean | null;
	}>();
});

test("constructors are never null; subscripts always are; casts preserve", () => {
	expectTypeOf<
		Row<"SELECT ARRAY[n_id] AS a, ROW(n_id) AS b, nums[1] AS c, n_nums[1] AS d, n_nums[1:2] AS e, n_id::int8 AS f, id::int8 AS g, NULL::int4 AS h, CAST(n_text AS int4) AS i, NULL AS j FROM things">
	>().toEqualTypeOf<{
		a: number[];
		b: unknown;
		c: number | null;
		d: number | null;
		e: number[] | null;
		f: string | null;
		g: string;
		h: number | null;
		i: number | null;
		j: null;
	}>();
});

test("functions: strict by default, with the documented exceptions", () => {
	// strict (NULL in → NULL out)
	expectTypeOf<
		Row<"SELECT lower(n_text) AS a, length(n_text) AS b, abs(n_id) AS c, date_trunc('day', n_at) AS d, to_char(n_at, 'YYYY') AS e, lower(label) AS f FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: number | null;
		c: number | null;
		d: Date | null;
		e: string | null;
		f: string;
	}>();
	// never null
	expectTypeOf<
		Row<"SELECT concat(n_text, n_id) AS a, quote_nullable(n_text) AS b, num_nulls(n_id) AS c, jsonb_build_object('a', n_id)::text AS d, gen_random_uuid() AS e, now() AS f, pg_typeof(n_id)::text AS g, int4range(n_id, n_id) AS h, count(n_id) AS i FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: number;
		d: string;
		e: string;
		f: Date;
		g: string;
		h: string;
		i: string;
	}>();
	// always nullable
	expectTypeOf<
		Row<"SELECT array_length(nums, 1) AS a, array_position(nums, 1) AS b, lower(rng) AS c, regexp_match(label, 'x') AS d, data ->> 'a' AS e, jsonb_extract_path_text(data, 'a') AS f, jsonb_path_query_first(data, '$.a')::text AS g, current_setting('x', true) AS h, nullif(id, 1) AS i, regexp_substr(label, 'x') AS j, system_user AS k FROM things">
	>().toEqualTypeOf<{
		a: number | null;
		b: number | null;
		c: number | null;
		d: string[] | null;
		e: string | null;
		f: string | null;
		g: string | null;
		h: string | null;
		i: number | null;
		j: string | null;
		k: string | null;
	}>();
	// strict in some arguments only
	expectTypeOf<
		Row<"SELECT concat_ws(n_text, label) AS a, concat_ws(',', n_text) AS b, format(label, n_text) AS c, format(n_text) AS d, string_to_array(label, n_text) AS e, string_to_array(n_text, ',') AS f, array_to_string(nums, ',', n_text) AS g, array_to_string(nums, n_text) AS h FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: string;
		c: string;
		d: string | null;
		e: string[];
		f: string[] | null;
		g: string;
		h: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT array_remove(nums, NULL) AS a, array_cat(n_nums, nums) AS b, array_cat(n_nums, n_nums) AS c, array_append(n_nums, 1) AS d, array_prepend(n_id, nums) AS e, jsonb_set_lax(data, '{a}', NULL)::text AS f, array_positions(nums, n_id) AS g FROM things">
	>().toEqualTypeOf<{
		a: number[];
		b: number[];
		c: number[] | null;
		d: number[] | null;
		e: number[];
		f: string;
		g: number[];
	}>();
	// COALESCE-style: nullable only if all arguments are
	expectTypeOf<
		Row<"SELECT coalesce(n_id, 0) AS a, greatest(n_id, 1) AS b, least(n_id, n_big) AS c FROM things">
	>().toEqualTypeOf<{ a: number; b: number; c: string | null }>();
});

test("outer-join nullability propagates through expressions and functions", () => {
	expectTypeOf<
		Row<"SELECT lower(p.title) AS a, p.author_id + 1 AS b, coalesce(p.title, u.email) AS c, p.title IS NULL AS d, count(p.id) AS e, p.tags[1] AS f, p.meta ->> 'k' AS g, p.title || u.email AS h FROM users u LEFT JOIN posts p ON p.author_id = u.id GROUP BY p.title, p.author_id, p.tags, p.meta, u.email">
	>().toEqualTypeOf<{
		a: string | null;
		b: number | null;
		c: string;
		d: boolean;
		e: string;
		f: string | null;
		g: string | null;
		h: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT lower(p.title) AS a, p.tags[1] AS b FROM users u JOIN posts p ON p.author_id = u.id">
	>().toEqualTypeOf<{ a: string; b: string | null }>();
});

test("NULL literal and params", () => {
	expectTypeOf<
		Row<"SELECT NULL AS a, NULL::text AS b, coalesce(NULL, 1) AS c, 1 + NULL AS d, NULL::int4 + 1 AS e, nullif(NULL, 1) AS f, $1::int4 AS g, $1 AS h">
	>().toEqualTypeOf<{
		a: null;
		b: string | null;
		c: number;
		d: number | null;
		e: number | null;
		f: number | null;
		g: number;
		h: unknown;
	}>();
});
