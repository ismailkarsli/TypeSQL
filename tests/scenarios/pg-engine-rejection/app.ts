import { createSql, type RowType } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

interface DB {
	t: { id: Col<"int4">; k: Col<"text"> };
}
const sql = createSql<DB>(postgres);

// A window reference inside the SQL-standard string syntaxes must exist.
const named = sql(
	"SELECT position(k in (sum(id) OVER w)::text) AS p FROM t WINDOW w AS (ORDER BY id)",
);
export type Named = RowType<typeof named>;
sql("SELECT position(k in (sum(id) OVER nowin)::text) FROM t");
sql("SELECT substring(k from (row_number() OVER nowin)::int) FROM t");
sql("SELECT trim(both k from (count(*) OVER nowin)::text) FROM t");
sql("SELECT overlay(k placing 'x' from (count(*) OVER nowin)::int) FROM t");

// A known function called with arguments no overload takes does not exist.
const called = sql("SELECT upper(k) AS u, round(id, 1) AS r FROM t");
export type Called = RowType<typeof called>;
sql("SELECT upper(k, k) FROM t");
sql("SELECT lower() FROM t");

// Values of categories with no common type cannot be combined.
const combined = sql(
	"SELECT CASE WHEN id > 0 THEN id ELSE 1.5 END AS c, coalesce(id, 2) AS d FROM t",
);
export type Combined = RowType<typeof combined>;
sql("SELECT CASE WHEN id > 0 THEN id ELSE point(1, 2) END FROM t");
sql("SELECT coalesce(id, point(1, 2)) FROM t");
sql("SELECT greatest(id, point(1, 2)) FROM t");
sql("SELECT ARRAY[id, point(1, 2)] FROM t");
sql("SELECT id FROM t UNION SELECT point(1, 2)");

// ANY and ALL take an array on their right side.
const quantified = sql("SELECT id = ANY(ARRAY[id]::oid[]) AS hit FROM t");
export type Quantified = RowType<typeof quantified>;
sql("SELECT id = ANY(id::oid) FROM t");

// A field of a call's result needs a composite result.
sql("SELECT (abs(id)).* FROM t");
