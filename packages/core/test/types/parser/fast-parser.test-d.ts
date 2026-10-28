import { expectTypeOf, test } from "vitest";
import type { Analyze } from "../../../src/engine/index.js";
import {
	type Col,
	createSql,
	type DefaultTypeMap,
	type Nullable,
	type ParamsOf,
	type ParamsType,
	type RowOf,
	type RowType,
	type SqlError,
	type Validate,
} from "../../../src/index.js";

interface DB {
	items: { id: Col<"int4">; note: Nullable<"text">; payload: Col<"jsonb"> };
	names: {
		a: Col<"int4">;
		caf: Col<"int4">;
		cafÉ: Col<"text">;
		'a"b': Col<"text">;
		"has space": Col<"bool">;
		"a,b": Col<"text">;
		Ä: Col<"text">;
		ä: Col<"int4">;
	};
	a: { id: Col<"int4"> };
	'a"b': { id: Col<"text"> };
	where: { select: Col<"text"> };
}

type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;
const sql = createSql<DB>();

test("common SELECT headers retain aliases, column order and duplicate-name behavior", () => {
	expectTypeOf<Row<"SELECT id, note FROM items">>().toEqualTypeOf<{
		id: number;
		note: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT i.id AS key, i.note label FROM items AS i">
	>().toEqualTypeOf<{ key: number; label: string | null }>();
	expectTypeOf<Row<"SELECT i.* FROM items i">>().toEqualTypeOf<{
		id: number;
		note: string | null;
		payload: unknown;
	}>();
	expectTypeOf<
		Row<"SELECT id AS duplicate, note AS duplicate FROM items">
	>().toEqualTypeOf<{ duplicate: string | null }>();
	expectTypeOf<
		Row<"SELECT note AS duplicate, id AS duplicate FROM items">
	>().toEqualTypeOf<{ duplicate: number }>();
});

test("statement metadata retains the absence and presence of DISTINCT", () => {
	type Plain = Analyze<DB, "SELECT id FROM items">["stmt"];
	expectTypeOf<
		[
			Plain["body"]["distinct"],
			Plain["with"],
			Plain["orderBy"],
			Plain["limit"],
			Plain["offset"],
		]
	>().toEqualTypeOf<[false, null, [], null, null]>();
	expectTypeOf<
		Analyze<DB, "SELECT DISTINCT id FROM items">["stmt"]["body"]["distinct"]
	>().toEqualTypeOf<true>();
});

test("WHERE narrowing keeps its positive and negative nullability cases", () => {
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE note IS NOT NULL">
	>().toEqualTypeOf<{ id: number; note: string }>();
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE note = $1">
	>().toEqualTypeOf<{ id: number; note: string }>();
	expectTypeOf<
		Params<"SELECT id, note FROM items WHERE note = $1">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE note IS NULL">
	>().toEqualTypeOf<{ id: number; note: string | null }>();
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE note IS NOT NULL OR id = $1">
	>().toEqualTypeOf<{ id: number; note: string | null }>();
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE ($1::text IS NULL OR note = $1)">
	>().toEqualTypeOf<{ id: number; note: string | null }>();
	expectTypeOf<
		Params<"SELECT id, note FROM items WHERE ($1::text IS NULL OR note = $1)">
	>().toEqualTypeOf<[string | null]>();
});

test("quoted names preserve escapes, punctuation and non-ASCII case", () => {
	// Both a and a"b exist with different types: a prematurely closed quote must not succeed.
	expectTypeOf<Row<'SELECT "a""b" FROM names'>>().toEqualTypeOf<{
		'a"b': string;
	}>();
	expectTypeOf<Row<'SELECT id FROM "a""b"'>>().toEqualTypeOf<{
		id: string;
	}>();
	expectTypeOf<Row<'SELECT "a""b" AS "x""y" FROM names'>>().toEqualTypeOf<{
		'x"y': string;
	}>();
	expectTypeOf<
		Row<'SELECT "has space", "a,b", Ä, ä FROM names'>
	>().toEqualTypeOf<{
		"has space": boolean;
		"a,b": string;
		Ä: string;
		ä: number;
	}>();
	expectTypeOf<Row<"SELECT cafÉ FROM names">>().toEqualTypeOf<{
		cafÉ: string;
	}>();
	expectTypeOf<Row<'SELECT "select" FROM "where"'>>().toEqualTypeOf<{
		select: string;
	}>();
	expectTypeOf<Row<"SELECT id AS from FROM items">>().toEqualTypeOf<{
		from: number;
	}>();
});

test("case, whitespace, comments and delimiter text keep their SQL meaning", () => {
	expectTypeOf<
		Row<"  SeLeCt\tID,\nNoTe\nFrOm\tITEMS\nWhErE\tID = $1">
	>().toEqualTypeOf<{ id: number; note: string | null }>();
	expectTypeOf<
		Row<"SELECT\nid,\tnote\nFROM\titems\nWHERE note IS NOT NULL">
	>().toEqualTypeOf<{ id: number; note: string }>();
	expectTypeOf<
		Row<"SELECT id /* FROM absent, WHERE */ AS key, note FROM items -- WHERE absent\nWHERE id = $1">
	>().toEqualTypeOf<{ key: number; note: string | null }>();
	expectTypeOf<
		Row<"SELECT ' FROM absent, WHERE id = $8' AS text, id FROM items">
	>().toEqualTypeOf<{ text: string; id: number }>();
	expectTypeOf<
		Params<"SELECT ' FROM absent, WHERE id = $8' AS text, id FROM items">
	>().toEqualTypeOf<[]>();
	expectTypeOf<Row<"SELECT id FROM items;">>().toEqualTypeOf<{ id: number }>();
});

test("line comments cannot manufacture a FROM clause", () => {
	expectTypeOf<V<"SELECT id -- FROM items">>().toEqualTypeOf<
		SqlError<'column "id" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT id -- FROM items\n">>().toEqualTypeOf<
		SqlError<'column "id" does not exist', 1>
	>();
	expectTypeOf<Row<"SELECT id -- FROM items">>().toEqualTypeOf<never>();
	expectTypeOf<
		Row<"SELECT id -- ignored FROM bogus\nFROM items">
	>().toEqualTypeOf<{ id: number }>();
});

test("ORDER BY and LIMIT/OFFSET keep parameter inference and validation", () => {
	expectTypeOf<
		Row<"SELECT id, note FROM items WHERE id = $1 ORDER BY note DESC NULLS FIRST LIMIT $2::int4 OFFSET $3::int4">
	>().toEqualTypeOf<{ id: number; note: string | null }>();
	expectTypeOf<
		Params<"SELECT id, note FROM items WHERE id = $1 ORDER BY note DESC NULLS FIRST LIMIT $2::int4 OFFSET $3::int4">
	>().toEqualTypeOf<[number | null, number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM items ORDER BY id OFFSET $1::int4 LIMIT $2::int4">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<V<"SELECT id FROM items ORDER BY missing">>().toEqualTypeOf<
		SqlError<'column "missing" does not exist', 6>
	>();
});

type TenSpaces = "          ";
type HundredSpaces =
	`${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}${TenSpaces}`;
type ThousandSpaces =
	`${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}${HundredSpaces}`;
type EightTargets = "id, id, id, id, id, id, id, id";
type SixtyFourTargets =
	`${EightTargets}, ${EightTargets}, ${EightTargets}, ${EightTargets}, ${EightTargets}, ${EightTargets}, ${EightTargets}, ${EightTargets}`;
type ManyTargets = `${SixtyFourTargets}, ${EightTargets}`;

test("large valid inputs retain the general parser's capacity", () => {
	expectTypeOf<
		Row<`${ThousandSpaces}${ThousandSpaces}SELECT id FROM items`>
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<`SELECT ${ManyTargets} FROM items`>>().toEqualTypeOf<{
		id: number;
	}>();
});

test("header keywords need boundaries and aliases consume their full syntax", () => {
	expectTypeOf<V<"SELECT idFROM items">>().toEqualTypeOf<
		SqlError<'column "idfrom" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT idfrom items">>().toEqualTypeOf<
		SqlError<'column "idfrom" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT id AS key extra FROM items">>().toEqualTypeOf<
		SqlError<"syntax error at or near extra", 4>
	>();
	expectTypeOf<V<"SELECT id key extra FROM items">>().toEqualTypeOf<
		SqlError<"syntax error at or near extra", 3>
	>();
});

test("errors retain exact messages and original statement positions", () => {
	expectTypeOf<V<"SELECT missing FROM items">>().toEqualTypeOf<
		SqlError<'column "missing" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT id FROM missing_relation">>().toEqualTypeOf<
		SqlError<'relation "missing_relation" does not exist', 3>
	>();
	expectTypeOf<V<"SELECT id FROM items WHERE missing = $1">>().toEqualTypeOf<
		SqlError<'column "missing" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT id FROM items AS select">>().toEqualTypeOf<
		SqlError<"syntax error at or near select", 5>
	>();
	expectTypeOf<V<"SELECT id FROM items; SELECT id FROM items">>().toEqualTypeOf<
		SqlError<"syntax error at or near select: only one statement is allowed", 5>
	>();
});

test("the optimized engine retains SQL helpers and carried parameter checking", () => {
	const predicate = sql.combine(
		[sql.fragment("id = $1", 1), sql.fragment("note IS NOT NULL")],
		{ separator: " AND " },
	);
	const q = sql("SELECT {column}, note FROM items WHERE {predicate}", {
		column: sql.id("id"),
		predicate,
	});
	expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{
		id: number;
		note: string;
	}>();
	const named = sql(
		"SELECT id, note FROM items WHERE id = :id LIMIT :limit::int4",
		{
			id: 1,
			limit: 5,
		},
	);
	expectTypeOf<RowType<typeof named>>().toEqualTypeOf<{
		id: number;
		note: string | null;
	}>();
	expectTypeOf<ParamsType<typeof named>>().toEqualTypeOf<
		[number | null, number | null]
	>();
	const inline = sql(`SELECT id FROM items WHERE id = ${sql.param(1)}`);
	expectTypeOf<RowType<typeof inline>>().toEqualTypeOf<{ id: number }>();
	const insert = sql("INSERT INTO items {values} RETURNING id", {
		values: sql.values("items", [
			{ id: 1, note: "x", payload: sql.json({ a: 1 }) },
		]),
	});
	expectTypeOf<RowType<typeof insert>>().toEqualTypeOf<{ id: number }>();
	const update = sql(
		"UPDATE items SET {set} WHERE id = $1 RETURNING id",
		{
			set: sql.set("items", { note: "x" }),
		},
		1,
	);
	expectTypeOf<RowType<typeof update>>().toEqualTypeOf<{ id: number }>();
	const dynamic = sql.as<{ id: number }>("SELECT id FROM items {tail}", {
		tail: sql.raw("WHERE id = 1"),
	});
	expectTypeOf<RowType<typeof dynamic>>().toEqualTypeOf<{ id: number }>();
	// @ts-expect-error the carried string cannot fill an int4 parameter
	sql(`SELECT id FROM items WHERE id = ${sql.param("wrong")}`);
});
