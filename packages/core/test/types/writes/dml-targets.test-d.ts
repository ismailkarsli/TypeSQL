import { expectTypeOf, test } from "vitest";
import type { KindOf } from "../../../src/engine/index.js";
import type {
	ApplyDdl,
	Col,
	DefaultTypeMap,
	Generated,
	Nullable,
	ParamsOf,
	RowOf,
	SqlError,
	Validate,
} from "../../../src/index.js";

interface DB {
	items: {
		id: Generated<"int4">;
		name: Col<"text">;
		tags: Col<"text[]">;
		scores: Nullable<"int4[]">;
		data: Col<"jsonb">;
		pos: Nullable<"point">;
		addr: Nullable<"address">;
	};
	notes: { id: Generated<"int4">; body: Nullable<"text"> };
	logs: {
		id: Generated<"int8">;
		item_id: Col<"int4">;
		msg: Nullable<"text">;
	};
}

type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("subscripted and field assignment targets", () => {
	expectTypeOf<
		V<"UPDATE items SET tags[1] = 'a', scores[1:2] = '{1,2}', data['k'] = '1', addr.city = 'x', pos[0] = 1 WHERE id = 1">
	>().toEqualTypeOf<"UPDATE items SET tags[1] = 'a', scores[1:2] = '{1,2}', data['k'] = '1', addr.city = 'x', pos[0] = 1 WHERE id = 1">();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1:2], data['a']['b']) VALUES ('n', '{a,b}', '1')">
	>().toEqualTypeOf<"INSERT INTO items (name, tags[1:2], data['a']['b']) VALUES ('n', '{a,b}', '1')">();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1], tags[2], data) VALUES ('n', NULL, 'b', '{}') ON CONFLICT (id) DO UPDATE SET tags[1] = excluded.tags[1]">
	>().toEqualTypeOf<"INSERT INTO items (name, tags[1], tags[2], data) VALUES ('n', NULL, 'b', '{}') ON CONFLICT (id) DO UPDATE SET tags[1] = excluded.tags[1]">();
	expectTypeOf<
		V<"UPDATE items SET (tags[1], name) = ('a', 'b')">
	>().toEqualTypeOf<"UPDATE items SET (tags[1], name) = ('a', 'b')">();
	// subscripts in a row on an array apply to it together
	expectTypeOf<
		V<"UPDATE items SET scores[1][2] = 1, tags[1:1][1:2] = '{}'">
	>().toEqualTypeOf<"UPDATE items SET scores[1][2] = 1, tags[1:1][1:2] = '{}'">();
	// a subscript is an expression of the statement's scope
	expectTypeOf<
		V<"UPDATE items SET tags[id] = name">
	>().toEqualTypeOf<"UPDATE items SET tags[id] = name">();
});

test("built-in types without subscripting, by Postgres's name", () => {
	type No<T extends string> =
		Validate<{ x: { c: Col<T> } }, "UPDATE x SET c[1] = NULL"> extends SqlError<
			infer M,
			unknown
		>
			? M
			: never;
	expectTypeOf<
		[
			No<"bool">,
			No<"int2">,
			No<"int4">,
			No<"int8">,
			No<"float4">,
			No<"float8">,
			No<"numeric">,
			No<"money">,
			No<"text">,
			No<"varchar">,
			No<"bpchar">,
			No<"char">,
			No<"bytea">,
			No<"date">,
			No<"time">,
			No<"timetz">,
			No<"timestamp">,
			No<"timestamptz">,
			No<"interval">,
			No<"uuid">,
			No<"json">,
			No<"xml">,
			No<"inet">,
			No<"cidr">,
			No<"macaddr">,
			No<"macaddr8">,
			No<"bit">,
			No<"varbit">,
			No<"oid">,
			No<"regclass">,
			No<"regtype">,
			No<"regproc">,
			No<"path">,
			No<"polygon">,
			No<"circle">,
			No<"tsvector">,
			No<"tsquery">,
			No<"int4range">,
			No<"int8range">,
			No<"numrange">,
			No<"tsrange">,
			No<"tstzrange">,
			No<"daterange">,
			Validate<
				{ x: { c: Col<"mood"> }; $types: { mood: "a" | "b" } },
				"UPDATE x SET c[1] = NULL"
			> extends SqlError<infer M, unknown>
				? M
				: never,
		]
	>().toEqualTypeOf<
		[
			`cannot subscript type boolean because it does not support subscripting`,
			`cannot subscript type smallint because it does not support subscripting`,
			`cannot subscript type integer because it does not support subscripting`,
			`cannot subscript type bigint because it does not support subscripting`,
			`cannot subscript type real because it does not support subscripting`,
			`cannot subscript type double precision because it does not support subscripting`,
			`cannot subscript type numeric because it does not support subscripting`,
			`cannot subscript type money because it does not support subscripting`,
			`cannot subscript type text because it does not support subscripting`,
			`cannot subscript type character varying because it does not support subscripting`,
			`cannot subscript type character because it does not support subscripting`,
			`cannot subscript type "char" because it does not support subscripting`,
			`cannot subscript type bytea because it does not support subscripting`,
			`cannot subscript type date because it does not support subscripting`,
			`cannot subscript type time without time zone because it does not support subscripting`,
			`cannot subscript type time with time zone because it does not support subscripting`,
			`cannot subscript type timestamp without time zone because it does not support subscripting`,
			`cannot subscript type timestamp with time zone because it does not support subscripting`,
			`cannot subscript type interval because it does not support subscripting`,
			`cannot subscript type uuid because it does not support subscripting`,
			`cannot subscript type json because it does not support subscripting`,
			`cannot subscript type xml because it does not support subscripting`,
			`cannot subscript type inet because it does not support subscripting`,
			`cannot subscript type cidr because it does not support subscripting`,
			`cannot subscript type macaddr because it does not support subscripting`,
			`cannot subscript type macaddr8 because it does not support subscripting`,
			`cannot subscript type bit because it does not support subscripting`,
			`cannot subscript type bit varying because it does not support subscripting`,
			`cannot subscript type oid because it does not support subscripting`,
			`cannot subscript type regclass because it does not support subscripting`,
			`cannot subscript type regtype because it does not support subscripting`,
			`cannot subscript type regproc because it does not support subscripting`,
			`cannot subscript type path because it does not support subscripting`,
			`cannot subscript type polygon because it does not support subscripting`,
			`cannot subscript type circle because it does not support subscripting`,
			`cannot subscript type tsvector because it does not support subscripting`,
			`cannot subscript type tsquery because it does not support subscripting`,
			`cannot subscript type int4range because it does not support subscripting`,
			`cannot subscript type int8range because it does not support subscripting`,
			`cannot subscript type numrange because it does not support subscripting`,
			`cannot subscript type tsrange because it does not support subscripting`,
			`cannot subscript type tstzrange because it does not support subscripting`,
			`cannot subscript type daterange because it does not support subscripting`,
			`cannot subscript type mood because it does not support subscripting`,
		]
	>();
});

test("assignment target syntax: subscripts, slices and fields (Postgres's errors and positions)", () => {
	type E<Q extends string> =
		V<Q> extends SqlError<infer M extends string, infer At> ? [M, At] : "ok";
	expectTypeOf<
		[
			E<"UPDATE items SET tags[1 = 'a'">,
			E<"UPDATE items SET tags[1:2 = '{}'">,
			E<"UPDATE items SET tags[+] = 'a'">,
			E<"UPDATE items SET tags[1:+] = '{}'">,
			E<"UPDATE items SET name. = 'a'">,
			E<"UPDATE items SET name.* = 'a'">,
			E<"INSERT INTO items (tags[1], name.*) VALUES ('a', 'b')">,
		]
	>().toEqualTypeOf<
		[
			['syntax error: expected "]" at or near end of input', 8],
			['syntax error: expected "]" at or near end of input', 10],
			["syntax error at or near ]", 6],
			["syntax error at or near ]", 8],
			["syntax error: expected field name at or near =", 5],
			['row expansion via "*" is not supported here', 3],
			['row expansion via "*" is not supported here', 9],
		]
	>();
	expectTypeOf<
		[
			E<"UPDATE items SET tags[1:] = '{}'">,
			E<"UPDATE items SET tags[:2] = '{}'">,
			E<"UPDATE items SET tags[:] = '{}'">,
			E<"UPDATE items * SET name = 'a'">,
			E<"DELETE FROM items * WHERE id = 1">,
		]
	>().toEqualTypeOf<["ok", "ok", "ok", "ok", "ok"]>();
});

test("assignment target errors", () => {
	// SET (a, b) = …: indirection checked; a subquery's width is not checked after a star (Postgres: number of columns does not match number of values)
	expectTypeOf<
		V<"UPDATE items SET (name[1], tags) = ('a', '{}')">
	>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<
		V<"UPDATE items SET (name, tags) = (SELECT * FROM items)">
	>().toEqualTypeOf<"UPDATE items SET (name, tags) = (SELECT * FROM items)">();
	// the source's width is unknown after a star
	expectTypeOf<
		V<"INSERT INTO items SELECT * FROM items">
	>().toEqualTypeOf<"INSERT INTO items SELECT * FROM items">();
	// every VALUES row is checked
	expectTypeOf<
		V<"INSERT INTO items (name, tags, data) VALUES ('a', '{}', '{}'), (NULL, '{}', '{}')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "name" of relation "items" violates not-null constraint',
			4
		>
	>();
	// a field after a subscript; the second of two targets; a plain column next to one with indirection
	expectTypeOf<V<"UPDATE items SET name[1].f = 'x'">>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<
		V<"INSERT INTO items (tags[1], name[1]) VALUES ('a', 'b')">
	>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1]) VALUES (NULL, 'x')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "name" of relation "items" violates not-null constraint',
			4
		>
	>();
	// a subscript is typed against the input columns
	expectTypeOf<V<"UPDATE items SET tags[nope] = 'x'">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			5
		>
	>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[nope]) VALUES ('a', 'x')">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			8
		>
	>();
	expectTypeOf<V<"UPDATE items SET name[1] = 'x'">>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<V<"UPDATE items SET data[1:2] = '1'">>().toEqualTypeOf<
		SqlError<"jsonb subscript does not support slices", 0>
	>();
	expectTypeOf<V<"UPDATE items SET nope[1] = 1">>().toEqualTypeOf<
		SqlError<
			'column "nope" of relation "items" does not exist. Perhaps you meant the column "name"?',
			3
		>
	>();
	// SET targets are not qualified: `i.name` is field `name` of a column `i`
	expectTypeOf<V<"UPDATE items i SET i.name = 'x'">>().toEqualTypeOf<
		SqlError<'column "i" of relation "items" does not exist', 2>
	>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[nope]) VALUES ('a', 'b')">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			8
		>
	>();
});

test("DEFAULT cannot be stored through an indirection (Postgres names its first step)", () => {
	expectTypeOf<V<"UPDATE items SET tags[1] = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set an array element to DEFAULT", 0>
	>();
	expectTypeOf<V<"UPDATE items SET data['k'] = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set an array element to DEFAULT", 0>
	>();
	expectTypeOf<V<"UPDATE items SET addr.city = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set a subfield to DEFAULT", 0>
	>();
	expectTypeOf<V<"UPDATE items SET addr.city[1] = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set a subfield to DEFAULT", 0>
	>();
	expectTypeOf<V<"UPDATE items SET tags[1].x = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set an array element to DEFAULT", 0>
	>();
	expectTypeOf<
		V<"UPDATE items SET (name, tags[1]) = ('a', DEFAULT)">
	>().toEqualTypeOf<SqlError<"cannot set an array element to DEFAULT", 0>>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1], data) VALUES ('a', DEFAULT, '{}')">
	>().toEqualTypeOf<SqlError<"cannot set an array element to DEFAULT", 0>>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags, data, addr.city) VALUES ('a', '{}', '{}', DEFAULT)">
	>().toEqualTypeOf<SqlError<"cannot set a subfield to DEFAULT", 0>>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1], data) VALUES ('a', 'x', '{}'), ('b', DEFAULT, '{}')">
	>().toEqualTypeOf<SqlError<"cannot set an array element to DEFAULT", 0>>();
	expectTypeOf<
		V<"MERGE INTO items i USING notes n ON i.id = n.id WHEN MATCHED THEN UPDATE SET addr.city = DEFAULT">
	>().toEqualTypeOf<SqlError<"cannot set a subfield to DEFAULT", 0>>();
	expectTypeOf<
		V<"MERGE INTO items i USING notes n ON i.id = n.id WHEN NOT MATCHED THEN INSERT (name, tags[1], data) VALUES ('a', DEFAULT, '{}')">
	>().toEqualTypeOf<SqlError<"cannot set an array element to DEFAULT", 0>>();
	// a NULL can be stored there, and DEFAULT in the whole column
	expectTypeOf<
		V<"UPDATE items SET tags[1] = NULL, addr.city = NULL, scores = DEFAULT">
	>().toEqualTypeOf<"UPDATE items SET tags[1] = NULL, addr.city = NULL, scores = DEFAULT">();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1], data, scores, addr.city) VALUES ('a', NULL, '{}', DEFAULT, NULL)">
	>().toEqualTypeOf<"INSERT INTO items (name, tags[1], data, scores, addr.city) VALUES ('a', NULL, '{}', DEFAULT, NULL)">();
	// before the subscripts
	expectTypeOf<V<"UPDATE items SET tags[nope] = DEFAULT">>().toEqualTypeOf<
		SqlError<"cannot set an array element to DEFAULT", 0>
	>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[nope]) VALUES ('a', DEFAULT)">
	>().toEqualTypeOf<SqlError<"cannot set an array element to DEFAULT", 0>>();
	// the value is typed first
	expectTypeOf<V<"UPDATE items SET tags[1] = nope">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			8
		>
	>();
});

test("Postgres's order: the values, then each target, then a second assignment", () => {
	expectTypeOf<
		V<"INSERT INTO items (name, tags[nope]) VALUES (nope2, 'x')">
	>().toEqualTypeOf<SqlError<'column "nope2" does not exist', 13>>();
	expectTypeOf<
		V<"UPDATE items SET tags[nope] = 1, name = nope2">
	>().toEqualTypeOf<SqlError<'column "nope2" does not exist', 12>>();
	expectTypeOf<
		V<"UPDATE items SET (name, nope) = ('a', 'b'), pos = nope2">
	>().toEqualTypeOf<SqlError<'column "nope2" does not exist', 17>>();
	expectTypeOf<
		V<"UPDATE items SET (name, nope) = (SELECT 'a', 'b')">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" of relation "items" does not exist. Perhaps you meant the column "name"?',
			6
		>
	>();
	expectTypeOf<
		V<"MERGE INTO items i USING notes n ON i.id = n.id WHEN MATCHED THEN UPDATE SET nope = 1, name = nope2">
	>().toEqualTypeOf<SqlError<'column "nope2" does not exist', 26>>();
	expectTypeOf<
		V<"UPDATE items SET name = 'a', name = 'b', tags[nope] = 'x'">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			13
		>
	>();
});

test("a column assigned whole is assigned once; its elements or fields any number of times", () => {
	expectTypeOf<
		V<"INSERT INTO items (name, tags, tags[1], data) VALUES ('a', '{}', 'x', '{}')">
	>().toEqualTypeOf<SqlError<'column "tags" specified more than once', 6>>();
	expectTypeOf<
		V<"INSERT INTO items (name, tags[1], tags, data) VALUES ('a', 'x', '{}', '{}')">
	>().toEqualTypeOf<SqlError<'column "tags" specified more than once', 6>>();
	expectTypeOf<
		V<"UPDATE items SET tags = '{}', tags[1] = 'a'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "tags"', 3>
	>();
	expectTypeOf<
		V<"UPDATE items SET tags[1] = 'a', tags = '{}'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "tags"', 3>
	>();
	expectTypeOf<
		V<"UPDATE items SET (tags, name) = ('{}', 'a'), tags[1] = 'b'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "tags"', 4>
	>();
	expectTypeOf<
		V<"UPDATE items SET tags[1] = 'a', (name, tags[2]) = ('b', 'c'), scores[1] = 1, scores[2] = 2">
	>().toEqualTypeOf<"UPDATE items SET tags[1] = 'a', (name, tags[2]) = ('b', 'c'), scores[1] = 1, scores[2] = 2">();
	expectTypeOf<
		V<"MERGE INTO items i USING notes n ON i.id = n.id WHEN MATCHED THEN UPDATE SET name = 'a', name = 'b'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "name"', 20>
	>();
	expectTypeOf<
		V<"MERGE INTO items i USING notes n ON i.id = n.id WHEN NOT MATCHED THEN INSERT (name, tags, data, name) VALUES ('a', '{}', '{}', 'b')">
	>().toEqualTypeOf<SqlError<'column "name" specified more than once', 21>>();
});

test("parameters of indirected targets take the element / field type", () => {
	expectTypeOf<
		Params<"UPDATE items SET tags[$1] = $2, scores[1:2] = $3 WHERE id = $4">
	>().toEqualTypeOf<
		[number, string | null, (number | null)[] | null, number | null]
	>();
	// a NULL slice leaves a non-null array as it is
	expectTypeOf<Params<"UPDATE items SET tags[1:2] = $1">>().toEqualTypeOf<
		[(string | null)[] | null]
	>();
	expectTypeOf<
		Params<"INSERT INTO items (name, tags[1], data) VALUES ($1, $2, $3)">
	>().toEqualTypeOf<[string, string | null, unknown]>();
	expectTypeOf<
		Params<"MERGE INTO items i USING notes n ON i.id = n.id WHEN NOT MATCHED THEN INSERT (name, tags[1], data) VALUES ($1, $2, $3)">
	>().toEqualTypeOf<[string, string | null, unknown]>();
	// SET (…) = ROW: by position; a subquery's parameters are not typed by the targets
	expectTypeOf<
		Params<"UPDATE items SET (tags[1], name) = ($1, $2)">
	>().toEqualTypeOf<[string | null, string]>();
	expectTypeOf<
		Params<"UPDATE items SET (name, data) = (SELECT $1, $2)">
	>().toEqualTypeOf<[unknown, unknown]>();
	// in RETURNING a bare column is the target's (not old's or new's)
	expectTypeOf<
		[
			Params<"UPDATE items SET name = 'x' RETURNING id = $1 AS x">,
			Params<"DELETE FROM items RETURNING id = $1 AS x">,
			Params<"INSERT INTO items (name, tags, data) VALUES ('a', '{}', '{}') RETURNING id = $1 AS x">,
		]
	>().toEqualTypeOf<[[number | null], [number | null], [number | null]]>();
	// every VALUES row; a SELECT's bare targets; a set operation's are not typed by the targets
	expectTypeOf<
		Params<"INSERT INTO items (name, tags[1], data) VALUES ($1, $2, '{}'), ($3, $4, '{}')">
	>().toEqualTypeOf<[string, string | null, string, string | null]>();
	expectTypeOf<
		Params<"INSERT INTO items (name, tags[1], data) SELECT $1, $2, '{}'">
	>().toEqualTypeOf<[string, string | null]>();
	expectTypeOf<
		Params<"INSERT INTO items (name, tags[1], data) SELECT $1, upper($2), '{}'">
	>().toEqualTypeOf<[string, string | null]>();
	expectTypeOf<
		Params<"INSERT INTO items (name, tags[1], data) SELECT $1, $2, '{}' UNION SELECT 'a', 'b', '{}'">
	>().toEqualTypeOf<[unknown, unknown]>();
	// parameters before a target without indirection stay
	expectTypeOf<
		Params<"UPDATE items SET name = $1, (scores, tags[1]) = ($2, $3)">
	>().toEqualTypeOf<[string, (number | null)[] | null, string | null]>();
	expectTypeOf<
		Params<"WITH x AS (SELECT $1::int4 AS n) INSERT INTO items (name, tags[1], data) VALUES ($2, $3, '{}')">
	>().toEqualTypeOf<[number, string, string | null]>();
	expectTypeOf<
		Params<"WITH x AS (SELECT $1::int4 AS n) INSERT INTO notes DEFAULT VALUES">
	>().toEqualTypeOf<[number]>();
});

test("WHERE CURRENT OF", () => {
	expectTypeOf<
		Row<"DELETE FROM items WHERE CURRENT OF c RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		V<"UPDATE items SET name = 'x' WHERE CURRENT OF c">
	>().toEqualTypeOf<"UPDATE items SET name = 'x' WHERE CURRENT OF c">();
	expectTypeOf<V<"DELETE FROM items WHERE CURRENT OF">>().toEqualTypeOf<
		SqlError<"syntax error: expected cursor name at or near end of input", 6>
	>();
});

test("RETURNING old / new (PostgreSQL 18)", () => {
	// INSERT: no old row
	expectTypeOf<
		Row<"INSERT INTO logs (item_id) VALUES (1) RETURNING old.id AS o, new.id AS n, id">
	>().toEqualTypeOf<{ o: string | null; n: string; id: string }>();
	expectTypeOf<
		Row<"INSERT INTO logs (item_id) VALUES (1) RETURNING old.*">
	>().toEqualTypeOf<{
		id: string | null;
		item_id: number | null;
		msg: string | null;
	}>();
	// UPDATE: both
	expectTypeOf<
		Row<"UPDATE logs SET msg = 'x' RETURNING old.msg AS before, new.msg AS after, old.item_id, new.item_id AS ni">
	>().toEqualTypeOf<{
		before: string | null;
		after: string | null;
		item_id: number;
		ni: number;
	}>();
	// DELETE: no new row
	expectTypeOf<
		Row<"DELETE FROM logs RETURNING old.item_id AS o, new.item_id AS n">
	>().toEqualTypeOf<{ o: number; n: number | null }>();
	// whole rows, sub-queries, renamed with WITH (...)
	expectTypeOf<
		Row<"UPDATE logs SET msg = 'x' RETURNING (SELECT old.item_id + 1) AS next">
	>().toEqualTypeOf<{ next: number | null }>();
	expectTypeOf<
		Row<"UPDATE logs SET msg = 'x' RETURNING WITH (OLD AS o, NEW AS n) o.msg AS a, n.msg AS b">
	>().toEqualTypeOf<{ a: string | null; b: string | null }>();
	// renamed to the other one's name: that name is taken, no default row is added under it
	expectTypeOf<
		Row<"UPDATE logs SET msg = 'x' RETURNING WITH (OLD AS new) new.item_id">
	>().toEqualTypeOf<{ item_id: number }>();
	expectTypeOf<
		Row<"DELETE FROM logs RETURNING WITH (NEW AS old) old.item_id">
	>().toEqualTypeOf<{ item_id: number | null }>();
	// `*` stays the target's columns
	expectTypeOf<Row<"DELETE FROM logs RETURNING *">>().toEqualTypeOf<{
		id: string;
		item_id: number;
		msg: string | null;
	}>();
});

test("RETURNING old / new: Postgres's errors and masking", () => {
	expectTypeOf<
		V<"INSERT INTO logs (item_id) VALUES (1) RETURNING WITH (new AS logs) *">
	>().toEqualTypeOf<
		SqlError<'table name "logs" specified more than once', 2>
	>();
	expectTypeOf<
		V<"INSERT INTO logs (item_id) VALUES (1) RETURNING WITH (old AS logs) *">
	>().toEqualTypeOf<
		SqlError<'table name "logs" specified more than once', 2>
	>();
	expectTypeOf<
		V<"INSERT INTO logs (item_id) VALUES (1) RETURNING WITH (old AS o, new AS n, old AS o) *">
	>().toEqualTypeOf<SqlError<"OLD cannot be specified multiple times", 0>>();
	expectTypeOf<
		V<"INSERT INTO logs (item_id) VALUES (1) RETURNING WITH (old AS o, new AS n, new AS n) *">
	>().toEqualTypeOf<SqlError<"NEW cannot be specified multiple times", 0>>();
	expectTypeOf<
		V<"INSERT INTO logs (item_id) VALUES (1) RETURNING WITH (old AS x, new AS x) *">
	>().toEqualTypeOf<SqlError<'table name "x" specified more than once', 15>>();
	// renamed: `old` is no longer a name
	expectTypeOf<
		V<"UPDATE logs SET msg = 'x' RETURNING WITH (OLD AS o) old.msg">
	>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "old"', 9>>();
	// a FROM item named `old` masks the default
	expectTypeOf<
		Row<"UPDATE logs SET msg = old.name FROM items old WHERE old.id = logs.item_id RETURNING old.name">
	>().toEqualTypeOf<{ name: string }>();
	// old / new columns are not reachable unqualified
	expectTypeOf<V<"DELETE FROM logs RETURNING nope">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 4>
	>();
});

test("INSERT ... SELECT with an empty target list", () => {
	expectTypeOf<
		V<"INSERT INTO notes SELECT RETURNING id">
	>().toEqualTypeOf<"INSERT INTO notes SELECT RETURNING id">();
});

test("SELECT INTO creates a table", () => {
	expectTypeOf<
		KindOf<DB, "SELECT id, name INTO TEMP TABLE copy FROM items">
	>().toEqualTypeOf<"create_table_as">();
	expectTypeOf<
		Row<"SELECT id, name INTO copy FROM items">
	>().toEqualTypeOf<never>();
	type DB2 = ApplyDdl<
		DB,
		"SELECT id, name AS label INTO copy FROM items WHERE id > 1"
	>;
	expectTypeOf<
		RowOf<DB2, DefaultTypeMap, "SELECT * FROM copy">
	>().toEqualTypeOf<{ id: number | null; label: string | null }>();
	// at the new table's name, as in Postgres
	expectTypeOf<V<"SELECT * FROM (SELECT 1 INTO f) bar">>().toEqualTypeOf<
		SqlError<"SELECT ... INTO is not allowed here", 7>
	>();
	// at the keyword's name, not after a quoted name spelled like it
	expectTypeOf<
		V<'SELECT 1 AS "into" FROM (SELECT 1 INTO f) bar'>
	>().toEqualTypeOf<SqlError<"SELECT ... INTO is not allowed here", 9>>();
	expectTypeOf<V<"INSERT INTO logs (item_id) SELECT 1 INTO f">>().toEqualTypeOf<
		SqlError<"SELECT ... INTO is not allowed here", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM (SELECT 1 INTO TEMP TABLE f) bar">
	>().toEqualTypeOf<SqlError<"SELECT ... INTO is not allowed here", 9>>();
	expectTypeOf<
		V<"MERGE INTO logs l USING (SELECT 1 AS id INTO f) s ON l.id = s.id WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<SqlError<"SELECT ... INTO is not allowed here", 11>>();
	// a WITH query keeps its INTO, which is rejected: only a top-level SELECT creates a table
	expectTypeOf<V<"WITH x AS (SELECT 1 INTO f) SELECT 1">>().toEqualTypeOf<
		SqlError<"SELECT ... INTO is not allowed here", 7>
	>();
	// LOCAL / GLOBAL TEMP[ORARY]; LOCAL alone is not a persistence
	type DB3 = ApplyDdl<
		DB,
		"SELECT 1 AS a INTO LOCAL TEMP t1; SELECT 1 AS b INTO GLOBAL TEMPORARY TABLE t2"
	>;
	expectTypeOf<
		RowOf<DB3, DefaultTypeMap, "SELECT * FROM t1, t2">
	>().toEqualTypeOf<{
		a: number | null;
		b: number | null;
	}>();
	expectTypeOf<V<"SELECT 1 AS a INTO LOCAL x">>().toEqualTypeOf<
		SqlError<"syntax error at or near x", 6>
	>();
	// a name is required
	expectTypeOf<V<"SELECT 1 INTO TEMP TABLE">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 5>
	>();
});
