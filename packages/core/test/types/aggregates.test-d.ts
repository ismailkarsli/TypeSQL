import { expectTypeOf, test } from "vitest";
import type { Interval, Row } from "./_schema.js";

// Aggregate result types and nullability, verified against PostgreSQL 18:
// an aggregate over an empty input is NULL (except count / regr_count → 0), so without GROUP BY
// every other aggregate is nullable; with GROUP BY it is nullable only if its argument is.

test("count is int8 and never null", () => {
	expectTypeOf<
		Row<"SELECT count(*) AS a, count(id) AS b, count(DISTINCT n_text) AS c, count(*) FILTER (WHERE flag) AS d, count(n_id) AS e FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	expectTypeOf<
		Row<"SELECT count(*) AS a FROM things GROUP BY id">
	>().toEqualTypeOf<{ a: string }>();
});

test("sum / avg result types follow the input type", () => {
	expectTypeOf<
		Row<"SELECT sum(small) AS a, sum(id) AS b, sum(big) AS c, sum(price) AS d, sum(score) AS e, sum(ratio) AS f, sum(dur) AS g FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: number;
		f: number;
		g: Interval;
	}>();
	expectTypeOf<
		Row<"SELECT avg(small) AS a, avg(id) AS b, avg(big) AS c, avg(price) AS d, avg(score) AS e, avg(ratio) AS f, avg(dur) AS g FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: number;
		f: number;
		g: Interval;
	}>();
});

test("ungrouped aggregates are nullable; grouped ones follow their argument", () => {
	expectTypeOf<
		Row<"SELECT sum(id) AS a, max(label) AS b, min(day) AS c, avg(price) AS d, bool_and(flag) AS e, string_agg(label, ',') AS f, array_agg(id) AS g, max(mood) AS h FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: string | null;
		c: Date | null;
		d: string | null;
		e: boolean | null;
		f: string | null;
		g: number[] | null;
		h: "happy" | "sad" | null;
	}>();
	expectTypeOf<
		Row<"SELECT sum(id) AS a, max(label) AS b, min(day) AS c, bool_and(flag) AS d, string_agg(label, ',') AS e, array_agg(id) AS f, max(n_text) AS g, sum(n_big) AS h, max(mood) AS i FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: Date;
		d: boolean;
		e: string;
		f: number[];
		g: string | null;
		h: string | null;
		i: "happy" | "sad";
	}>();
	expectTypeOf<
		Row<"SELECT max(id) AS a FROM things HAVING count(*) > 0">
	>().toEqualTypeOf<{ a: number | null }>();
});

test("FILTER makes every aggregate but count nullable", () => {
	expectTypeOf<
		Row<"SELECT sum(id) FILTER (WHERE flag) AS a, count(id) FILTER (WHERE flag) AS b, max(label) FILTER (WHERE flag) AS c, array_agg(id) FILTER (WHERE id > 1) AS d FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string | null;
		b: string;
		c: string | null;
		d: number[] | null;
	}>();
});

test("DISTINCT and ORDER BY inside aggregates do not change the type", () => {
	expectTypeOf<
		Row<"SELECT array_agg(DISTINCT label) AS a, string_agg(label, ',' ORDER BY label) AS b, array_agg(id ORDER BY id DESC) AS c, count(DISTINCT id) AS d, string_agg(DISTINCT label, ',') AS e FROM things GROUP BY big">
	>().toEqualTypeOf<{
		a: string[];
		b: string;
		c: number[];
		d: string;
		e: string;
	}>();
});

test("boolean, bit and statistical aggregates", () => {
	expectTypeOf<
		Row<"SELECT bool_or(flag) AS a, every(flag) AS b, bit_and(id) AS c, bit_or(big) AS d, bit_xor(small) AS e, any_value(label) AS f FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: number;
		d: string;
		e: number;
		f: string;
	}>();
	// stddev/variance: numeric for exact inputs, float8 for floats; regr_count is int8 and never null
	expectTypeOf<
		Row<"SELECT stddev(id) AS a, stddev(score) AS b, stddev(ratio) AS c, variance(price) AS d, var_pop(big) AS e, stddev_samp(score) AS f, corr(ratio, ratio) AS g, regr_count(ratio, ratio) AS h, regr_slope(id, id) AS i FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string;
		b: number;
		c: number;
		d: string;
		e: string;
		f: number;
		g: number;
		h: string;
		i: number;
	}>();
	expectTypeOf<
		Row<"SELECT regr_count(ratio, ratio) AS a, stddev(id) AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string | null }>();
});

test("ordered-set aggregates take their type from WITHIN GROUP (ORDER BY ...)", () => {
	expectTypeOf<
		Row<"SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS a, percentile_cont(0.5) WITHIN GROUP (ORDER BY dur) AS b, percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY id) AS c, percentile_cont(ARRAY[0.5]) WITHIN GROUP (ORDER BY dur) AS d FROM things GROUP BY id">
	>().toEqualTypeOf<{ a: number; b: Interval; c: number[]; d: Interval[] }>();
	expectTypeOf<
		Row<"SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY label) AS a, percentile_disc(ARRAY[0.5]) WITHIN GROUP (ORDER BY big) AS b, mode() WITHIN GROUP (ORDER BY day) AS c, rank(1) WITHIN GROUP (ORDER BY id) AS d FROM things GROUP BY id">
	>().toEqualTypeOf<{ a: string; b: string[]; c: Date; d: string }>();
	expectTypeOf<
		Row<"SELECT mode() WITHIN GROUP (ORDER BY day) AS a, percentile_disc(0.5) WITHIN GROUP (ORDER BY mood) AS b FROM things">
	>().toEqualTypeOf<{ a: Date | null; b: "happy" | "sad" | null }>();
});

test("JSON, array and range aggregates", () => {
	// JSON aggregates collect (or skip) NULL inputs: a non-empty group is never NULL
	expectTypeOf<
		Row<"SELECT json_agg(id)::text AS a, jsonb_agg(label)::text AS b, json_object_agg(label, id)::text AS c, jsonb_object_agg(label, id)::text AS d, jsonb_agg_strict(n_id)::text AS e, jsonb_object_agg_unique(label, n_id)::text AS f FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
	}>();
	expectTypeOf<
		Row<"SELECT jsonb_agg(id)::text AS a FROM things">
	>().toEqualTypeOf<{ a: string | null }>();
	// array_agg of arrays stays one-dimensional in the type system (Postgres has no array-of-array type)
	expectTypeOf<
		Row<"SELECT array_agg(nums) AS a, array_agg(words) AS b, array_agg(n_id) AS c, array_agg(mood) AS d, array_agg(day) AS e FROM things GROUP BY id">
	>().toEqualTypeOf<{
		a: number[];
		b: string[];
		c: number[] | null;
		d: ("happy" | "sad")[];
		e: Date[];
	}>();
	expectTypeOf<
		Row<"SELECT range_agg(rng) AS a, range_intersect_agg(rng) AS b, xmlagg(label::xml) AS c FROM things GROUP BY id">
	>().toEqualTypeOf<{ a: unknown; b: string; c: string }>();
});

test("aggregates over outer-joined (nullable) columns", () => {
	expectTypeOf<
		Row<"SELECT u.id, count(p.id) AS n, max(p.title) AS t, sum(p.author_id) AS s, bool_and(p.body IS NULL) AS b FROM users u LEFT JOIN posts p ON p.author_id = u.id GROUP BY u.id">
	>().toEqualTypeOf<{
		id: number;
		n: string;
		t: string | null;
		s: string | null;
		b: boolean;
	}>();
});

test("aggregates in HAVING and nested in expressions", () => {
	expectTypeOf<
		Row<"SELECT id, sum(price) * 2 AS doubled, coalesce(max(n_text), 'none') AS m, count(*)::int4 AS c FROM things GROUP BY id HAVING sum(price) > 10">
	>().toEqualTypeOf<{ id: number; doubled: string; m: string; c: number }>();
	expectTypeOf<
		Row<"SELECT sum(price) * 2 AS doubled, coalesce(max(n_text), 'none') AS m FROM things">
	>().toEqualTypeOf<{ doubled: string | null; m: string }>();
});
