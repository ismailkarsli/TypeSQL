import { expectTypeOf, test } from "vitest";
import type { ApplyDdl, Nullable, SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// PostgreSQL 18's keyword categories (`pg_get_keywords()`): reserved (R), column-name (C) and
// type/function-name (T) keywords, and the 39 keywords that are no bare column label. One
// statement per keyword and rule, written out so that the types oracle replays each against the
// server; each one's result depends on the keyword's category.

/** Apply DDL to an empty database. */
type D<Q extends string> = ApplyDdl<{}, Q>;

test("reserved and type/function-name keywords are no table alias (ColId)", () => {
	// reserved
	expectTypeOf<V<"SELECT * FROM users AS all">>().toEqualTypeOf<
		SqlError<"syntax error at or near all", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS analyse">>().toEqualTypeOf<
		SqlError<"syntax error at or near analyse", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS analyze">>().toEqualTypeOf<
		SqlError<"syntax error at or near analyze", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS and">>().toEqualTypeOf<
		SqlError<"syntax error at or near and", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS any">>().toEqualTypeOf<
		SqlError<"syntax error at or near any", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS array">>().toEqualTypeOf<
		SqlError<"syntax error at or near array", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS as">>().toEqualTypeOf<
		SqlError<"syntax error at or near as", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS asc">>().toEqualTypeOf<
		SqlError<"syntax error at or near asc", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS asymmetric">>().toEqualTypeOf<
		SqlError<"syntax error at or near asymmetric", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS both">>().toEqualTypeOf<
		SqlError<"syntax error at or near both", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS case">>().toEqualTypeOf<
		SqlError<"syntax error at or near case", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS cast">>().toEqualTypeOf<
		SqlError<"syntax error at or near cast", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS check">>().toEqualTypeOf<
		SqlError<"syntax error at or near check", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS collate">>().toEqualTypeOf<
		SqlError<"syntax error at or near collate", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS column">>().toEqualTypeOf<
		SqlError<"syntax error at or near column", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS constraint">>().toEqualTypeOf<
		SqlError<"syntax error at or near constraint", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS create">>().toEqualTypeOf<
		SqlError<"syntax error at or near create", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_catalog">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_catalog", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_date">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_date", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_role">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_role", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_time">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_time", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_timestamp">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_timestamp", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_user">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_user", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS default">>().toEqualTypeOf<
		SqlError<"syntax error at or near default", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS deferrable">>().toEqualTypeOf<
		SqlError<"syntax error at or near deferrable", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS desc">>().toEqualTypeOf<
		SqlError<"syntax error at or near desc", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS distinct">>().toEqualTypeOf<
		SqlError<"syntax error at or near distinct", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS do">>().toEqualTypeOf<
		SqlError<"syntax error at or near do", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS else">>().toEqualTypeOf<
		SqlError<"syntax error at or near else", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS end">>().toEqualTypeOf<
		SqlError<"syntax error at or near end", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS except">>().toEqualTypeOf<
		SqlError<"syntax error at or near except", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS false">>().toEqualTypeOf<
		SqlError<"syntax error at or near false", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS fetch">>().toEqualTypeOf<
		SqlError<"syntax error at or near fetch", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS for">>().toEqualTypeOf<
		SqlError<"syntax error at or near for", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS foreign">>().toEqualTypeOf<
		SqlError<"syntax error at or near foreign", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS from">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS grant">>().toEqualTypeOf<
		SqlError<"syntax error at or near grant", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS group">>().toEqualTypeOf<
		SqlError<"syntax error at or near group", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS having">>().toEqualTypeOf<
		SqlError<"syntax error at or near having", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS in">>().toEqualTypeOf<
		SqlError<"syntax error at or near in", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS initially">>().toEqualTypeOf<
		SqlError<"syntax error at or near initially", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS intersect">>().toEqualTypeOf<
		SqlError<"syntax error at or near intersect", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS into">>().toEqualTypeOf<
		SqlError<"syntax error at or near into", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS lateral">>().toEqualTypeOf<
		SqlError<"syntax error at or near lateral", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS leading">>().toEqualTypeOf<
		SqlError<"syntax error at or near leading", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS limit">>().toEqualTypeOf<
		SqlError<"syntax error at or near limit", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS localtime">>().toEqualTypeOf<
		SqlError<"syntax error at or near localtime", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS localtimestamp">>().toEqualTypeOf<
		SqlError<"syntax error at or near localtimestamp", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS not">>().toEqualTypeOf<
		SqlError<"syntax error at or near not", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS null">>().toEqualTypeOf<
		SqlError<"syntax error at or near null", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS offset">>().toEqualTypeOf<
		SqlError<"syntax error at or near offset", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS on">>().toEqualTypeOf<
		SqlError<"syntax error at or near on", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS only">>().toEqualTypeOf<
		SqlError<"syntax error at or near only", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS or">>().toEqualTypeOf<
		SqlError<"syntax error at or near or", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS order">>().toEqualTypeOf<
		SqlError<"syntax error at or near order", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS placing">>().toEqualTypeOf<
		SqlError<"syntax error at or near placing", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS primary">>().toEqualTypeOf<
		SqlError<"syntax error at or near primary", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS references">>().toEqualTypeOf<
		SqlError<"syntax error at or near references", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS returning">>().toEqualTypeOf<
		SqlError<"syntax error at or near returning", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS select">>().toEqualTypeOf<
		SqlError<"syntax error at or near select", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS session_user">>().toEqualTypeOf<
		SqlError<"syntax error at or near session_user", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS some">>().toEqualTypeOf<
		SqlError<"syntax error at or near some", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS symmetric">>().toEqualTypeOf<
		SqlError<"syntax error at or near symmetric", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS system_user">>().toEqualTypeOf<
		SqlError<"syntax error at or near system_user", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS table">>().toEqualTypeOf<
		SqlError<"syntax error at or near table", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS then">>().toEqualTypeOf<
		SqlError<"syntax error at or near then", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS to">>().toEqualTypeOf<
		SqlError<"syntax error at or near to", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS trailing">>().toEqualTypeOf<
		SqlError<"syntax error at or near trailing", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS true">>().toEqualTypeOf<
		SqlError<"syntax error at or near true", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS union">>().toEqualTypeOf<
		SqlError<"syntax error at or near union", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS unique">>().toEqualTypeOf<
		SqlError<"syntax error at or near unique", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS user">>().toEqualTypeOf<
		SqlError<"syntax error at or near user", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS using">>().toEqualTypeOf<
		SqlError<"syntax error at or near using", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS variadic">>().toEqualTypeOf<
		SqlError<"syntax error at or near variadic", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS when">>().toEqualTypeOf<
		SqlError<"syntax error at or near when", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS where">>().toEqualTypeOf<
		SqlError<"syntax error at or near where", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS window">>().toEqualTypeOf<
		SqlError<"syntax error at or near window", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS with">>().toEqualTypeOf<
		SqlError<"syntax error at or near with", 5>
	>();
	// type/function-name
	expectTypeOf<V<"SELECT * FROM users AS authorization">>().toEqualTypeOf<
		SqlError<"syntax error at or near authorization", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS binary">>().toEqualTypeOf<
		SqlError<"syntax error at or near binary", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS collation">>().toEqualTypeOf<
		SqlError<"syntax error at or near collation", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS concurrently">>().toEqualTypeOf<
		SqlError<"syntax error at or near concurrently", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS cross">>().toEqualTypeOf<
		SqlError<"syntax error at or near cross", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS current_schema">>().toEqualTypeOf<
		SqlError<"syntax error at or near current_schema", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS freeze">>().toEqualTypeOf<
		SqlError<"syntax error at or near freeze", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS full">>().toEqualTypeOf<
		SqlError<"syntax error at or near full", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS ilike">>().toEqualTypeOf<
		SqlError<"syntax error at or near ilike", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS inner">>().toEqualTypeOf<
		SqlError<"syntax error at or near inner", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS is">>().toEqualTypeOf<
		SqlError<"syntax error at or near is", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS isnull">>().toEqualTypeOf<
		SqlError<"syntax error at or near isnull", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS join">>().toEqualTypeOf<
		SqlError<"syntax error at or near join", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS left">>().toEqualTypeOf<
		SqlError<"syntax error at or near left", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS like">>().toEqualTypeOf<
		SqlError<"syntax error at or near like", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS natural">>().toEqualTypeOf<
		SqlError<"syntax error at or near natural", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS notnull">>().toEqualTypeOf<
		SqlError<"syntax error at or near notnull", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS outer">>().toEqualTypeOf<
		SqlError<"syntax error at or near outer", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS overlaps">>().toEqualTypeOf<
		SqlError<"syntax error at or near overlaps", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS right">>().toEqualTypeOf<
		SqlError<"syntax error at or near right", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS similar">>().toEqualTypeOf<
		SqlError<"syntax error at or near similar", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS tablesample">>().toEqualTypeOf<
		SqlError<"syntax error at or near tablesample", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users AS verbose">>().toEqualTypeOf<
		SqlError<"syntax error at or near verbose", 5>
	>();
});

test("column-name keywords are table aliases and qualifiers", () => {
	expectTypeOf<Row<"SELECT between.id FROM users AS between">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT bigint.id FROM users AS bigint">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT bit.id FROM users AS bit">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT boolean.id FROM users AS boolean">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT char.id FROM users AS char">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT character.id FROM users AS character">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT coalesce.id FROM users AS coalesce">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT dec.id FROM users AS dec">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT decimal.id FROM users AS decimal">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT exists.id FROM users AS exists">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT extract.id FROM users AS extract">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT float.id FROM users AS float">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT greatest.id FROM users AS greatest">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT grouping.id FROM users AS grouping">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT inout.id FROM users AS inout">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT int.id FROM users AS int">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT integer.id FROM users AS integer">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT interval.id FROM users AS interval">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT json.id FROM users AS json">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT json_array.id FROM users AS json_array">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_arrayagg.id FROM users AS json_arrayagg">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_exists.id FROM users AS json_exists">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_object.id FROM users AS json_object">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_objectagg.id FROM users AS json_objectagg">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_query.id FROM users AS json_query">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_scalar.id FROM users AS json_scalar">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_serialize.id FROM users AS json_serialize">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_table.id FROM users AS json_table">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT json_value.id FROM users AS json_value">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT least.id FROM users AS least">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT merge_action.id FROM users AS merge_action">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT national.id FROM users AS national">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT nchar.id FROM users AS nchar">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT none.id FROM users AS none">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT normalize.id FROM users AS normalize">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT nullif.id FROM users AS nullif">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT numeric.id FROM users AS numeric">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT out.id FROM users AS out">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT overlay.id FROM users AS overlay">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT position.id FROM users AS position">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT precision.id FROM users AS precision">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT real.id FROM users AS real">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT row.id FROM users AS row">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT setof.id FROM users AS setof">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT smallint.id FROM users AS smallint">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT substring.id FROM users AS substring">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT time.id FROM users AS time">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT timestamp.id FROM users AS timestamp">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT treat.id FROM users AS treat">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT trim.id FROM users AS trim">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT values.id FROM users AS values">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT varchar.id FROM users AS varchar">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT xmlattributes.id FROM users AS xmlattributes">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlconcat.id FROM users AS xmlconcat">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlelement.id FROM users AS xmlelement">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlexists.id FROM users AS xmlexists">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlforest.id FROM users AS xmlforest">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlnamespaces.id FROM users AS xmlnamespaces">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmlparse.id FROM users AS xmlparse">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT xmlpi.id FROM users AS xmlpi">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT xmlroot.id FROM users AS xmlroot">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT xmlserialize.id FROM users AS xmlserialize">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT xmltable.id FROM users AS xmltable">
	>().toEqualTypeOf<{ id: number }>();
});

test("column-name keywords are no parameter name (type_function_name)", () => {
	// unreserved keywords are
	expectTypeOf<
		Row<"SELECT make_date(year => 2024, month => 1, day => 1)">
	>().toEqualTypeOf<{ make_date: Date }>();
	expectTypeOf<V<"SELECT make_date(between => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(bigint => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(bit => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(boolean => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(char => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(character => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(coalesce => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(dec => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(decimal => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(exists => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(extract => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(float => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(greatest => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(grouping => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(inout => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(int => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(integer => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(interval => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_array => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_arrayagg => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_exists => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_object => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_objectagg => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_query => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_scalar => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_serialize => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_table => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(json_value => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(least => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(merge_action => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(national => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(nchar => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(none => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(normalize => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(nullif => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(numeric => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(out => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(overlay => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(position => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(precision => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(real => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(row => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(setof => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(smallint => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(substring => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(time => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(timestamp => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(treat => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(trim => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(values => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(varchar => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlattributes => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlconcat => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlelement => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlexists => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlforest => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlnamespaces => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlparse => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlpi => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlroot => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmlserialize => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT make_date(xmltable => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
});

test("the keywords that are no bare column label", () => {
	expectTypeOf<V<"SELECT 1 array">>().toEqualTypeOf<
		SqlError<"syntax error at or near array", 2>
	>();
	expectTypeOf<V<"SELECT 1 as">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 char">>().toEqualTypeOf<
		SqlError<"syntax error at or near char", 2>
	>();
	expectTypeOf<V<"SELECT 1 character">>().toEqualTypeOf<
		SqlError<"syntax error at or near character", 2>
	>();
	expectTypeOf<V<"SELECT 1 create">>().toEqualTypeOf<
		SqlError<"syntax error at or near create", 2>
	>();
	expectTypeOf<V<"SELECT 1 day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 2>
	>();
	expectTypeOf<V<"SELECT 1 except">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, VALUES, TABLE or ( at or near end of input",
			3
		>
	>();
	expectTypeOf<V<"SELECT 1 fetch">>().toEqualTypeOf<
		SqlError<"syntax error: expected FIRST or NEXT at or near end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 filter">>().toEqualTypeOf<
		SqlError<"syntax error at or near filter", 2>
	>();
	expectTypeOf<V<"SELECT 1 for">>().toEqualTypeOf<
		SqlError<"syntax error at or near for", 2>
	>();
	expectTypeOf<V<"SELECT 1 from">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near end of input",
			3
		>
	>();
	expectTypeOf<V<"SELECT 1 grant">>().toEqualTypeOf<
		SqlError<"syntax error at or near grant", 2>
	>();
	expectTypeOf<V<"SELECT 1 group">>().toEqualTypeOf<
		SqlError<"syntax error at or near group", 2>
	>();
	expectTypeOf<V<"SELECT 1 having">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 hour">>().toEqualTypeOf<
		SqlError<"syntax error at or near hour", 2>
	>();
	expectTypeOf<V<"SELECT 1 intersect">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, VALUES, TABLE or ( at or near end of input",
			3
		>
	>();
	expectTypeOf<V<"SELECT 1 into">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 3>
	>();
	expectTypeOf<Row<"SELECT 1 isnull">>().toEqualTypeOf<{
		"?column?": boolean;
	}>();
	expectTypeOf<V<"SELECT 1 limit">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 minute">>().toEqualTypeOf<
		SqlError<"syntax error at or near minute", 2>
	>();
	expectTypeOf<V<"SELECT 1 month">>().toEqualTypeOf<
		SqlError<"syntax error at or near month", 2>
	>();
	expectTypeOf<Row<"SELECT 1 notnull">>().toEqualTypeOf<{
		"?column?": boolean;
	}>();
	expectTypeOf<V<"SELECT 1 offset">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 on">>().toEqualTypeOf<
		SqlError<"syntax error at or near on", 2>
	>();
	expectTypeOf<V<"SELECT 1 order">>().toEqualTypeOf<
		SqlError<"syntax error at or near order", 2>
	>();
	expectTypeOf<V<"SELECT 1 over">>().toEqualTypeOf<
		SqlError<"syntax error at or near over", 2>
	>();
	expectTypeOf<V<"SELECT 1 overlaps">>().toEqualTypeOf<
		SqlError<"syntax error at or near overlaps", 2>
	>();
	expectTypeOf<V<"SELECT 1 precision">>().toEqualTypeOf<
		SqlError<"syntax error at or near precision", 2>
	>();
	expectTypeOf<V<"SELECT 1 returning">>().toEqualTypeOf<
		SqlError<"syntax error at or near returning", 2>
	>();
	expectTypeOf<V<"SELECT 1 second">>().toEqualTypeOf<
		SqlError<"syntax error at or near second", 2>
	>();
	expectTypeOf<V<"SELECT 1 to">>().toEqualTypeOf<
		SqlError<"syntax error at or near to", 2>
	>();
	expectTypeOf<V<"SELECT 1 union">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, VALUES, TABLE or ( at or near end of input",
			3
		>
	>();
	expectTypeOf<V<"SELECT 1 varying">>().toEqualTypeOf<
		SqlError<"syntax error at or near varying", 2>
	>();
	expectTypeOf<V<"SELECT 1 where">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 window">>().toEqualTypeOf<
		SqlError<"syntax error: expected window name at or near end of input", 3>
	>();
	expectTypeOf<V<"SELECT 1 with">>().toEqualTypeOf<
		SqlError<"syntax error at or near with", 2>
	>();
	expectTypeOf<V<"SELECT 1 within">>().toEqualTypeOf<
		SqlError<"syntax error at or near within", 2>
	>();
	expectTypeOf<V<"SELECT 1 without">>().toEqualTypeOf<
		SqlError<"syntax error at or near without", 2>
	>();
	expectTypeOf<V<"SELECT 1 year">>().toEqualTypeOf<
		SqlError<"syntax error at or near year", 2>
	>();
});

test("every other keyword is a bare column label, reserved ones too", () => {
	// reserved
	expectTypeOf<
		Row<"SELECT 1 all, 1 analyse, 1 analyze, 1 and, 1 any, 1 asc, 1 asymmetric, 1 both, 1 case, 1 cast, 1 check, 1 collate, 1 column, 1 constraint, 1 current_catalog, 1 current_date, 1 current_role, 1 current_time, 1 current_timestamp, 1 current_user, 1 default, 1 deferrable, 1 desc, 1 distinct, 1 do, 1 else, 1 end, 1 false, 1 foreign, 1 in, 1 initially, 1 lateral, 1 leading, 1 localtime, 1 localtimestamp, 1 not, 1 null, 1 only, 1 or, 1 placing, 1 primary, 1 references, 1 select, 1 session_user, 1 some, 1 symmetric, 1 system_user, 1 table, 1 then, 1 trailing, 1 true, 1 unique, 1 user, 1 using, 1 variadic, 1 when">
	>().toEqualTypeOf<{
		all: number;
		analyse: number;
		analyze: number;
		and: number;
		any: number;
		asc: number;
		asymmetric: number;
		both: number;
		case: number;
		cast: number;
		check: number;
		collate: number;
		column: number;
		constraint: number;
		current_catalog: number;
		current_date: number;
		current_role: number;
		current_time: number;
		current_timestamp: number;
		current_user: number;
		default: number;
		deferrable: number;
		desc: number;
		distinct: number;
		do: number;
		else: number;
		end: number;
		false: number;
		foreign: number;
		in: number;
		initially: number;
		lateral: number;
		leading: number;
		localtime: number;
		localtimestamp: number;
		not: number;
		null: number;
		only: number;
		or: number;
		placing: number;
		primary: number;
		references: number;
		select: number;
		session_user: number;
		some: number;
		symmetric: number;
		system_user: number;
		table: number;
		then: number;
		trailing: number;
		true: number;
		unique: number;
		user: number;
		using: number;
		variadic: number;
		when: number;
	}>();
	// column-name
	expectTypeOf<
		Row<"SELECT 1 between, 1 bigint, 1 bit, 1 boolean, 1 coalesce, 1 dec, 1 decimal, 1 exists, 1 extract, 1 float, 1 greatest, 1 grouping, 1 inout, 1 int, 1 integer, 1 interval, 1 json, 1 json_array, 1 json_arrayagg, 1 json_exists, 1 json_object, 1 json_objectagg, 1 json_query, 1 json_scalar, 1 json_serialize, 1 json_table, 1 json_value, 1 least, 1 merge_action, 1 national, 1 nchar, 1 none, 1 normalize, 1 nullif, 1 numeric, 1 out, 1 overlay, 1 position, 1 real, 1 row, 1 setof, 1 smallint, 1 substring, 1 time, 1 timestamp, 1 treat, 1 trim, 1 values, 1 varchar, 1 xmlattributes, 1 xmlconcat, 1 xmlelement, 1 xmlexists, 1 xmlforest, 1 xmlnamespaces, 1 xmlparse, 1 xmlpi, 1 xmlroot, 1 xmlserialize, 1 xmltable">
	>().toEqualTypeOf<{
		between: number;
		bigint: number;
		bit: number;
		boolean: number;
		coalesce: number;
		dec: number;
		decimal: number;
		exists: number;
		extract: number;
		float: number;
		greatest: number;
		grouping: number;
		inout: number;
		int: number;
		integer: number;
		interval: number;
		json: number;
		json_array: number;
		json_arrayagg: number;
		json_exists: number;
		json_object: number;
		json_objectagg: number;
		json_query: number;
		json_scalar: number;
		json_serialize: number;
		json_table: number;
		json_value: number;
		least: number;
		merge_action: number;
		national: number;
		nchar: number;
		none: number;
		normalize: number;
		nullif: number;
		numeric: number;
		out: number;
		overlay: number;
		position: number;
		real: number;
		row: number;
		setof: number;
		smallint: number;
		substring: number;
		time: number;
		timestamp: number;
		treat: number;
		trim: number;
		values: number;
		varchar: number;
		xmlattributes: number;
		xmlconcat: number;
		xmlelement: number;
		xmlexists: number;
		xmlforest: number;
		xmlnamespaces: number;
		xmlparse: number;
		xmlpi: number;
		xmlroot: number;
		xmlserialize: number;
		xmltable: number;
	}>();
	// type/function-name
	expectTypeOf<
		Row<"SELECT 1 authorization, 1 binary, 1 collation, 1 concurrently, 1 cross, 1 current_schema, 1 freeze, 1 full, 1 ilike, 1 inner, 1 is, 1 join, 1 left, 1 like, 1 natural, 1 outer, 1 right, 1 similar, 1 tablesample, 1 verbose">
	>().toEqualTypeOf<{
		authorization: number;
		binary: number;
		collation: number;
		concurrently: number;
		cross: number;
		current_schema: number;
		freeze: number;
		full: number;
		ilike: number;
		inner: number;
		is: number;
		join: number;
		left: number;
		like: number;
		natural: number;
		outer: number;
		right: number;
		similar: number;
		tablesample: number;
		verbose: number;
	}>();
	// unreserved
	expectTypeOf<
		Row<"SELECT 1 abort, 1 escape, 1 at, 1 operator">
	>().toEqualTypeOf<{
		abort: number;
		at: number;
		escape: number;
		operator: number;
	}>();
});

test("after AS and after a dot every keyword is a label (ColLabel)", () => {
	// reserved
	expectTypeOf<
		Row<"SELECT s.all, s.analyse, s.analyze, s.and, s.any, s.array, s.as, s.asc, s.asymmetric, s.both, s.case, s.cast, s.check, s.collate, s.column, s.constraint, s.create, s.current_catalog, s.current_date, s.current_role, s.current_time, s.current_timestamp, s.current_user, s.default, s.deferrable, s.desc, s.distinct, s.do, s.else, s.end, s.except, s.false, s.fetch, s.for, s.foreign, s.from, s.grant, s.group, s.having, s.in, s.initially, s.intersect, s.into, s.lateral, s.leading, s.limit, s.localtime, s.localtimestamp, s.not, s.null, s.offset, s.on, s.only, s.or, s.order, s.placing, s.primary, s.references, s.returning, s.select, s.session_user, s.some, s.symmetric, s.system_user, s.table, s.then, s.to, s.trailing, s.true, s.union, s.unique, s.user, s.using, s.variadic, s.when, s.where, s.window, s.with FROM (SELECT 1 AS all, 1 AS analyse, 1 AS analyze, 1 AS and, 1 AS any, 1 AS array, 1 AS as, 1 AS asc, 1 AS asymmetric, 1 AS both, 1 AS case, 1 AS cast, 1 AS check, 1 AS collate, 1 AS column, 1 AS constraint, 1 AS create, 1 AS current_catalog, 1 AS current_date, 1 AS current_role, 1 AS current_time, 1 AS current_timestamp, 1 AS current_user, 1 AS default, 1 AS deferrable, 1 AS desc, 1 AS distinct, 1 AS do, 1 AS else, 1 AS end, 1 AS except, 1 AS false, 1 AS fetch, 1 AS for, 1 AS foreign, 1 AS from, 1 AS grant, 1 AS group, 1 AS having, 1 AS in, 1 AS initially, 1 AS intersect, 1 AS into, 1 AS lateral, 1 AS leading, 1 AS limit, 1 AS localtime, 1 AS localtimestamp, 1 AS not, 1 AS null, 1 AS offset, 1 AS on, 1 AS only, 1 AS or, 1 AS order, 1 AS placing, 1 AS primary, 1 AS references, 1 AS returning, 1 AS select, 1 AS session_user, 1 AS some, 1 AS symmetric, 1 AS system_user, 1 AS table, 1 AS then, 1 AS to, 1 AS trailing, 1 AS true, 1 AS union, 1 AS unique, 1 AS user, 1 AS using, 1 AS variadic, 1 AS when, 1 AS where, 1 AS window, 1 AS with) s">
	>().toEqualTypeOf<{
		all: number;
		analyse: number;
		analyze: number;
		and: number;
		any: number;
		array: number;
		as: number;
		asc: number;
		asymmetric: number;
		both: number;
		case: number;
		cast: number;
		check: number;
		collate: number;
		column: number;
		constraint: number;
		create: number;
		current_catalog: number;
		current_date: number;
		current_role: number;
		current_time: number;
		current_timestamp: number;
		current_user: number;
		default: number;
		deferrable: number;
		desc: number;
		distinct: number;
		do: number;
		else: number;
		end: number;
		except: number;
		false: number;
		fetch: number;
		for: number;
		foreign: number;
		from: number;
		grant: number;
		group: number;
		having: number;
		in: number;
		initially: number;
		intersect: number;
		into: number;
		lateral: number;
		leading: number;
		limit: number;
		localtime: number;
		localtimestamp: number;
		not: number;
		null: number;
		offset: number;
		on: number;
		only: number;
		or: number;
		order: number;
		placing: number;
		primary: number;
		references: number;
		returning: number;
		select: number;
		session_user: number;
		some: number;
		symmetric: number;
		system_user: number;
		table: number;
		then: number;
		to: number;
		trailing: number;
		true: number;
		union: number;
		unique: number;
		user: number;
		using: number;
		variadic: number;
		when: number;
		where: number;
		window: number;
		with: number;
	}>();
	// column-name
	expectTypeOf<
		Row<"SELECT s.between, s.bigint, s.bit, s.boolean, s.char, s.character, s.coalesce, s.dec, s.decimal, s.exists, s.extract, s.float, s.greatest, s.grouping, s.inout, s.int, s.integer, s.interval, s.json, s.json_array, s.json_arrayagg, s.json_exists, s.json_object, s.json_objectagg, s.json_query, s.json_scalar, s.json_serialize, s.json_table, s.json_value, s.least, s.merge_action, s.national, s.nchar, s.none, s.normalize, s.nullif, s.numeric, s.out, s.overlay, s.position, s.precision, s.real, s.row, s.setof, s.smallint, s.substring, s.time, s.timestamp, s.treat, s.trim, s.values, s.varchar, s.xmlattributes, s.xmlconcat, s.xmlelement, s.xmlexists, s.xmlforest, s.xmlnamespaces, s.xmlparse, s.xmlpi, s.xmlroot, s.xmlserialize, s.xmltable FROM (SELECT 1 AS between, 1 AS bigint, 1 AS bit, 1 AS boolean, 1 AS char, 1 AS character, 1 AS coalesce, 1 AS dec, 1 AS decimal, 1 AS exists, 1 AS extract, 1 AS float, 1 AS greatest, 1 AS grouping, 1 AS inout, 1 AS int, 1 AS integer, 1 AS interval, 1 AS json, 1 AS json_array, 1 AS json_arrayagg, 1 AS json_exists, 1 AS json_object, 1 AS json_objectagg, 1 AS json_query, 1 AS json_scalar, 1 AS json_serialize, 1 AS json_table, 1 AS json_value, 1 AS least, 1 AS merge_action, 1 AS national, 1 AS nchar, 1 AS none, 1 AS normalize, 1 AS nullif, 1 AS numeric, 1 AS out, 1 AS overlay, 1 AS position, 1 AS precision, 1 AS real, 1 AS row, 1 AS setof, 1 AS smallint, 1 AS substring, 1 AS time, 1 AS timestamp, 1 AS treat, 1 AS trim, 1 AS values, 1 AS varchar, 1 AS xmlattributes, 1 AS xmlconcat, 1 AS xmlelement, 1 AS xmlexists, 1 AS xmlforest, 1 AS xmlnamespaces, 1 AS xmlparse, 1 AS xmlpi, 1 AS xmlroot, 1 AS xmlserialize, 1 AS xmltable) s">
	>().toEqualTypeOf<{
		between: number;
		bigint: number;
		bit: number;
		boolean: number;
		char: number;
		character: number;
		coalesce: number;
		dec: number;
		decimal: number;
		exists: number;
		extract: number;
		float: number;
		greatest: number;
		grouping: number;
		inout: number;
		int: number;
		integer: number;
		interval: number;
		json: number;
		json_array: number;
		json_arrayagg: number;
		json_exists: number;
		json_object: number;
		json_objectagg: number;
		json_query: number;
		json_scalar: number;
		json_serialize: number;
		json_table: number;
		json_value: number;
		least: number;
		merge_action: number;
		national: number;
		nchar: number;
		none: number;
		normalize: number;
		nullif: number;
		numeric: number;
		out: number;
		overlay: number;
		position: number;
		precision: number;
		real: number;
		row: number;
		setof: number;
		smallint: number;
		substring: number;
		time: number;
		timestamp: number;
		treat: number;
		trim: number;
		values: number;
		varchar: number;
		xmlattributes: number;
		xmlconcat: number;
		xmlelement: number;
		xmlexists: number;
		xmlforest: number;
		xmlnamespaces: number;
		xmlparse: number;
		xmlpi: number;
		xmlroot: number;
		xmlserialize: number;
		xmltable: number;
	}>();
	// type/function-name
	expectTypeOf<
		Row<"SELECT s.authorization, s.binary, s.collation, s.concurrently, s.cross, s.current_schema, s.freeze, s.full, s.ilike, s.inner, s.is, s.isnull, s.join, s.left, s.like, s.natural, s.notnull, s.outer, s.overlaps, s.right, s.similar, s.tablesample, s.verbose FROM (SELECT 1 AS authorization, 1 AS binary, 1 AS collation, 1 AS concurrently, 1 AS cross, 1 AS current_schema, 1 AS freeze, 1 AS full, 1 AS ilike, 1 AS inner, 1 AS is, 1 AS isnull, 1 AS join, 1 AS left, 1 AS like, 1 AS natural, 1 AS notnull, 1 AS outer, 1 AS overlaps, 1 AS right, 1 AS similar, 1 AS tablesample, 1 AS verbose) s">
	>().toEqualTypeOf<{
		authorization: number;
		binary: number;
		collation: number;
		concurrently: number;
		cross: number;
		current_schema: number;
		freeze: number;
		full: number;
		ilike: number;
		inner: number;
		is: number;
		isnull: number;
		join: number;
		left: number;
		like: number;
		natural: number;
		notnull: number;
		outer: number;
		overlaps: number;
		right: number;
		similar: number;
		tablesample: number;
		verbose: number;
	}>();
});

test("an operator keyword is a bare label when the token after it ends the target", () => {
	expectTypeOf<Row<"SELECT 1 and, 2">>().toEqualTypeOf<{
		and: number;
		"?column?": number;
	}>();
	expectTypeOf<
		Row<"SELECT 1 is, 1 in, 1 not, 1 at, 1 collate">
	>().toEqualTypeOf<{
		is: number;
		in: number;
		not: number;
		at: number;
		collate: number;
	}>();
	expectTypeOf<
		Row<"SELECT 1 between, 1 like, 1 ilike, 1 similar">
	>().toEqualTypeOf<{
		between: number;
		like: number;
		ilike: number;
		similar: number;
	}>();
	// after an AND or OR chain, and after operators that bind tighter
	expectTypeOf<
		Row<"SELECT true and false and, true or false or, NOT true and, 1 = 1 or, 1 + 2 is, 1 between 0 and 2 and">
	>().toEqualTypeOf<{ and: boolean; or: boolean; is: number }>();
	expectTypeOf<Row<'SELECT \'a\' COLLATE "C" collate, 2 "x"'>>().toEqualTypeOf<{
		collate: string;
		x: number;
	}>();
	// the tokens that end a target
	expectTypeOf<Row<"SELECT id like FROM users">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM (SELECT 1 in) s, LATERAL (SELECT 1 or) t">
	>().toEqualTypeOf<{ in: number; or: number }>();
	expectTypeOf<Row<"SELECT 1 is;">>().toEqualTypeOf<{ is: number }>();
	expectTypeOf<
		Row<"SELECT 1 like WHERE true GROUP BY 1 HAVING true WINDOW w AS () ORDER BY 1 LIMIT 1 OFFSET 0">
	>().toEqualTypeOf<{ like: number }>();
	expectTypeOf<Row<"SELECT 1 like GROUP BY 1">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like HAVING true">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like WINDOW w AS ()">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like ORDER BY 1">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like LIMIT 1">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like OFFSET 1">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like FETCH FIRST 1 ROW ONLY">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT id like FROM users FOR UPDATE">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 like FOR UPDATE">>().toEqualTypeOf<{
		like: number;
	}>();
	expectTypeOf<Row<"SELECT 1 and UNION SELECT 2">>().toEqualTypeOf<{
		and: number;
	}>();
	expectTypeOf<Row<"SELECT 1 and INTERSECT SELECT 2">>().toEqualTypeOf<{
		and: number;
	}>();
	expectTypeOf<Row<"SELECT 1 and EXCEPT SELECT 2">>().toEqualTypeOf<{
		and: number;
	}>();
	expectTypeOf<
		Row<"DELETE FROM users RETURNING id or, email like">
	>().toEqualTypeOf<{
		or: number;
		like: string;
	}>();
	// otherwise the keyword is the operator
	expectTypeOf<
		Row<"SELECT true and false, 1 is null, 1 in (1), 1 isnull, 2 notnull">
	>().toEqualTypeOf<{ "?column?": boolean }>();
	expectTypeOf<V<"SELECT 1 and">>().toEqualTypeOf<"SELECT 1 and">();
	expectTypeOf<V<"SELECT 1 is not, 2">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED at or near ,",
			4
		>
	>();
	expectTypeOf<V<"SELECT 1 not in, 2">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near ,', 4>
	>();
	expectTypeOf<V<"SELECT 1 between 0 and, 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	// IS binds inside the NOT, LIKE inside the AND: neither is the target's label
	expectTypeOf<V<"SELECT NOT true is, 2">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED at or near ,",
			4
		>
	>();
	expectTypeOf<V<"SELECT true and 'a' like, 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	// an AND or OR chain goes on before a token that continues it
	expectTypeOf<
		Row<"SELECT true and false and true, true or false or false or">
	>().toEqualTypeOf<{ "?column?": boolean; or: boolean }>();
	// only in a target list
	expectTypeOf<
		V<"SELECT 1 FROM users WHERE true and true and">
	>().toEqualTypeOf<SqlError<"syntax error at end of input", 9>>();
	expectTypeOf<V<"SELECT 1 FROM users WHERE true and">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 7>
	>();
	expectTypeOf<V<"SELECT (1 and)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
	expectTypeOf<V<"SELECT lower('a' like)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT 1 FROM users ORDER BY id is, 2">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED at or near ,",
			8
		>
	>();
});

test("a type/function-name keyword names a function, not a column", () => {
	expectTypeOf<
		Row<"SELECT left('abc', 2), pg_catalog.right('abc', 2) AS r">
	>().toEqualTypeOf<{ left: string; r: string }>();
	expectTypeOf<Row<"SELECT * FROM left('abc', 2)">>().toEqualTypeOf<{
		left: string;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (left('abc', 2), right('abc', 1)) AS r(a, b)">
	>().toEqualTypeOf<{ a: string | null; b: string | null }>();
	expectTypeOf<V<"SELECT left FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 2>
	>();
	expectTypeOf<V<"SELECT left.id FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near .", 2>
	>();
	expectTypeOf<V<"SELECT * FROM left">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near left",
			3
		>
	>();
	// a column-name keyword is a column: EXISTS only before a parenthesis
	expectTypeOf<
		Row<"SELECT exists.id, exists (SELECT) FROM users AS exists">
	>().toEqualTypeOf<{ id: number; exists: boolean }>();
	expectTypeOf<V<"SELECT exists FROM users">>().toEqualTypeOf<
		SqlError<'column "exists" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT exists (SELECT 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 5>
	>();
	expectTypeOf<V<"SELECT exists (SELECT FROM)">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near )",
			5
		>
	>();
});

test("qualified names: a ColId, then labels", () => {
	expectTypeOf<V<"SELECT users.select FROM users">>().toEqualTypeOf<
		SqlError<"column users.select does not exist", 0>
	>();
	expectTypeOf<V<"SELECT * FROM public.select">>().toEqualTypeOf<
		SqlError<'relation "public.select" does not exist', 3>
	>();
	// a field name too: `from` is looked up (Postgres: column u.from does not exist)
	expectTypeOf<V<"SELECT (u).from FROM users u">>().toEqualTypeOf<
		SqlError<'column "from" not found in data type record', 5>
	>();
});

test("type names: column-name keywords only the SQL type names", () => {
	expectTypeOf<
		Row<"SELECT '1'::bigint AS a, '1'::boolean AS b, '1'::dec AS c, '1'::decimal AS d, '1'::int AS e, '1'::integer AS f, '1'::json AS g, '1'::numeric AS h, '1'::real AS i, '1'::smallint AS j, '1'::varchar AS k">
	>().toEqualTypeOf<{
		a: string;
		b: boolean;
		c: string;
		d: string;
		e: number;
		f: number;
		g: unknown;
		h: string;
		i: number;
		j: number;
		k: string;
	}>();
	expectTypeOf<V<"SELECT CAST('1' AS between)">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near between", 5>
	>();
	expectTypeOf<V<"SELECT '1'::all">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near all", 3>
	>();
});

test("names in DDL and DML are ColIds", () => {
	expectTypeOf<D<"CREATE TABLE left (a int)">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near left", 2>
	>();
	expectTypeOf<D<"CREATE TABLE x (left int)">>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near left", 4>
	>();
	expectTypeOf<
		D<"CREATE TABLE public.select (between int CONSTRAINT xmlpi CHECK (between > 0))">
	>().toEqualTypeOf<{ select: { between: Nullable<"int4"> } }>();
	expectTypeOf<
		D<"CREATE TABLE x (a int CONSTRAINT select CHECK (a > 0))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected constraint name at or near select", 7>
	>();
	expectTypeOf<
		D<"CREATE TABLE x (a int, CONSTRAINT left CHECK (a > 0))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected constraint name at or near left", 8>
	>();
	expectTypeOf<V<"WITH left AS (SELECT 1) SELECT 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected CTE name at or near left", 1>
	>();
	expectTypeOf<V<"UPDATE users SET left = 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near left", 3>
	>();
});

test("FOR starts a locking clause", () => {
	expectTypeOf<
		Row<"SELECT id FROM users FOR NO KEY UPDATE FOR KEY SHARE">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<V<"SELECT id FROM users FOR KEY">>().toEqualTypeOf<
		SqlError<"syntax error at or near for", 4>
	>();
});
