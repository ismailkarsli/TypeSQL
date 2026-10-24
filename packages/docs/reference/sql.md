# Supported SQL

The SQL TypeSQL understands, by area. Everything listed is typed, not just parsed: row types, nullability, parameter types and output column names.

## SELECT

| Feature | Notes |
|---|---|
| Columns, aliases, `*`, `t.*` | |
| `WHERE`, `GROUP BY`, `HAVING` | `GROUP BY` and `ORDER BY` accept an alias or a position |
| `ORDER BY`, `LIMIT`, `OFFSET`, `FETCH` | `LIMIT $1` and `OFFSET $1` are `number \| null` |
| `DISTINCT`, `DISTINCT ON` | |
| Named windows (`WINDOW w AS (…)`) | |
| `FOR UPDATE` and the other locking clauses | |
| Whole-row references | `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)`, `t IS NULL`, `(t).col`, `(t).*`; see [Selecting data](../guide/queries) |

## Joins

| Feature | Nullability |
|---|---|
| `JOIN` / `INNER JOIN`, `CROSS JOIN`, comma joins | from the schema |
| `LEFT JOIN` | the right side becomes nullable |
| `RIGHT JOIN` | the left side becomes nullable |
| `FULL JOIN` | both sides become nullable |
| `USING (…)`, `NATURAL` | |
| Nested joins | `a JOIN b LEFT JOIN c ON … ON …`, `((SELECT …) s JOIN t ON …) j` |
| `LATERAL` | sees the `FROM` items before it |

See [Joins and nullability](../guide/queries#joins-and-nullability).

## Subqueries, CTEs and set operations

| Feature | Notes |
|---|---|
| Scalar subqueries | always nullable (they can return no row) |
| `EXISTS`, `IN (SELECT …)`, `ANY` / `ALL (SELECT …)` | `EXISTS` is a non-null boolean |
| Derived tables | `FROM (SELECT …) AS t(a, b)` |
| `WITH`, `WITH RECURSIVE` | a CTE becomes a table for the rest of the statement |
| `SEARCH` / `CYCLE` on recursive CTEs | their columns are added to the CTE |
| Data-modifying CTEs | `WITH x AS (INSERT … RETURNING …)`, `MERGE` included |
| `UNION`, `INTERSECT`, `EXCEPT` (`ALL`) | names from the first branch, types combined per position, nullable if any branch is |
| `VALUES` lists | as a statement, in `FROM` and in `INSERT` |
| Set-returning functions in `FROM` | `generate_series`, `unnest`, `jsonb_each`, … |
| `ROWS FROM (f(…), g(…)) WITH ORDINALITY` | zipped, so every column is nullable |
| `TABLESAMPLE` | |

## Expressions and operators

| Feature | Examples |
|---|---|
| Numeric promotion | `int4 + int8` is `int8` |
| Date and time arithmetic | `timestamptz - timestamptz` is an `interval` |
| JSON operators | `->`, `->>`, `#>`, `#>>`, `@>`, `?`, jsonb subscripts |
| String and array concatenation | `\|\|` |
| Comparisons | `=`, `<>`, `<`, …, `IS [NOT] DISTINCT FROM`, `BETWEEN`, `IN`, `IS [NOT] NULL` |
| Pattern matching | `LIKE`, `ILIKE`, regular expressions (`~`, `~*`, …) |
| `op ANY` / `op ALL` | `col = ANY($1)` takes an array |
| Casts | `x::T`, `CAST(x AS T)`, typed literals such as `timestamp with time zone '…'` and `interval '1 day'` |
| Conditionals | `CASE`, `COALESCE`, `NULLIF`, `GREATEST`, `LEAST` |
| Arrays | `ARRAY[…]`, `ARRAY(SELECT …)`, subscripts and slices |
| Special-syntax functions | `EXTRACT`, `SUBSTRING … FROM … FOR`, `TRIM`, `POSITION`, `OVERLAY` |
| Other | `IS [NOT] NORMALIZED`, `OVERLAPS`, `AT TIME ZONE`, `AT LOCAL` |
| Function arguments | named (`f(a => 1)`, `f(a := 1)`) and `VARIADIC` |

## Functions

- About 450 built-in functions are typed with their Postgres argument types, return types and null handling: string, numeric, date/time, JSON, array, aggregate and window functions.
- Function-style casts are typed: `date(ts)`, `int8(x)`.
- Common extensions are included: `pgcrypto`, `uuid-ossp`, `unaccent`, `pg_trgm`, `fuzzystrmatch`.
- Every other `pg_catalog` function is known by its return type. Its arguments are not checked.
- Aggregates: `count` is never null. Other aggregates are nullable when their argument is, and also without `GROUP BY`. `FILTER (WHERE …)` and `WITHIN GROUP (ORDER BY …)` are supported.
- Window functions: `row_number()`, `rank()` and friends are non-null `int8`. `lag()`, `lead()` and `first_value()` are nullable.
- A function Postgres would not find is an error, with a "Perhaps you meant" hint when a known name is close.
- Declare your own in the schema's `$functions` or in `FunctionCatalog` ([function catalog](./api#function-catalog)).

## JSON and SQL/JSON

| Feature | Type |
|---|---|
| `json_build_object` with literal keys | an object |
| `json_build_array` | a tuple |
| `json_agg(x)` | an array of `x` (nullable outside `GROUP BY`) |
| `json_object_agg` | an object with arbitrary keys |
| `to_json(t)` of a whole row | an object with one key per column |
| `->`, `#>`, subscripts with literal keys | the member of a known shape, always nullable |
| `->>`, `#>>` | `string \| null` |
| `JSON_OBJECT(k VALUE v, …)` | like `json_build_object`, never `NULL` |
| `JSON_ARRAY(a, b)`, `JSON_ARRAY(SELECT …)` | a tuple, an array of the query's column |
| `JSON_ARRAYAGG`, `JSON_OBJECTAGG` | like `json_agg` / `json_object_agg`; `RETURNING jsonb` makes them `jsonb` |
| `JSON_VALUE` | `text`, or its `RETURNING` type |
| `JSON_QUERY` | `jsonb` |
| `JSON_EXISTS`, `IS [NOT] JSON` | `bool` |
| `JSON_TABLE(…)` in `FROM` | the declared columns, all nullable except a top-level `FOR ORDINALITY` (`int4`) |

Values inside JSON are typed the way Postgres serializes them. See [JSON](../guide/queries#json).

## SQL/XML

| Feature | Type |
|---|---|
| `XMLELEMENT(NAME n, XMLATTRIBUTES(…), …)` | `xml`, never `NULL` |
| `XMLFOREST` | `xml`, `NULL` only when every value is |
| `XMLCONCAT`, `XMLPI`, `XMLROOT`, `XMLPARSE` | `xml`, with Postgres's null handling |
| `XMLEXISTS(… PASSING …)` | `bool` |
| `XMLSERIALIZE(… AS type)` | the type you name |
| `x IS [NOT] DOCUMENT` | `bool` |
| `XMLTABLE(… PASSING doc COLUMNS …)` in `FROM` | the declared columns: nullable unless `NOT NULL`, `FOR ORDINALITY` or a non-null `DEFAULT` |

## Parameters

`$1`, `:name`, and inline `${sql.param(value)}`, `${sql.json(value)}` and `${sql.valueOrDefault(value)}`. See [Parameters](../guide/parameters).

## Nullability narrowing

Conditions in `WHERE`, and in an inner join's `ON`, that rule out `NULL` make the column non-null in the result: `IS NOT NULL`, comparisons such as `= $1` or `> 0`, `LIKE`, `IN`, `BETWEEN`. Narrowing goes through top-level `AND` only. `OR` and `NOT` never narrow.

## INSERT, UPDATE, DELETE and MERGE

| Feature | Notes |
|---|---|
| `INSERT … VALUES`, multi-row `VALUES`, `DEFAULT VALUES` | every `NOT NULL` column without a default is required |
| `INSERT … SELECT` | its columns are checked against the target list |
| `OVERRIDING … VALUE` | |
| `ON CONFLICT … DO NOTHING`, `DO UPDATE SET … WHERE …` | `EXCLUDED` is the proposed row |
| `UPDATE … SET`, `UPDATE … FROM` | `RETURNING` can use every table |
| Assignment targets | array elements and slices, `jsonb` keys, fields of composite columns: `SET tags[1] = $1`, `INSERT INTO t (tags[1:2], addr.city)` |
| `DELETE … USING` | |
| `WHERE CURRENT OF cursor` | accepted; the cursor's row is not checked |
| `RETURNING`, `RETURNING *` | `*` expands to the target, or to every table in `FROM` / `USING` |
| `RETURNING old.*, new.*`, `RETURNING WITH (OLD AS o, NEW AS n)` | PostgreSQL 18; `old` is nullable in `INSERT`, `new` in `DELETE` |
| `MERGE INTO … USING … ON … WHEN [NOT] MATCHED [BY SOURCE \| BY TARGET] [AND …] THEN …` | actions checked like `UPDATE` / `INSERT`; `RETURNING` with `merge_action()` |
| Writing to a view | an error (`cannot insert into view "v"`) |

Without `RETURNING`, the row type is `never`.

## Cursors

- `DECLARE name CURSOR FOR query` checks the query and types its parameters like a `SELECT`. The statement itself returns no rows.
- `FETCH`, `MOVE` and `CLOSE` are checked for syntax only. The cursor's query is another statement, so a `FETCH` has no row type. Assert one with `sql.as<Row>("FETCH 10 FROM c")`.

## DDL

`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, views, materialized views, enums, schemas and `CREATE FUNCTION` change the schema type, through `ApplyDdl` and `migrations()`. Indexes, triggers, grants and other utility statements are accepted without a schema effect. See [DDL support](./ddl).

## Output column names

Unaliased columns get the names Postgres gives them:

| Expression | Name |
|---|---|
| a column | its name |
| a function call | the function's name (`lower`, `count`, `coalesce`) |
| special-syntax functions | Postgres's internal name (`trim(…)` is `btrim`, `EXTRACT(…)` is `extract`) |
| a special value | its keyword (`current_date`, `current_user`) |
| a cast | the name of what it casts (`id::text` is `id`), or the type's name for a literal (`1::int` is `int4`) |
| a typed literal | the type's name (`interval '1 day'` is `interval`) |
| `CASE` | the `ELSE` branch's name when it is a real name, else `case` |
| `EXISTS (…)`, `ARRAY[…]` | `exists`, `array` |
| anything else | `?column?` |

When two columns have the same name, the last one wins, as in the row objects the drivers build. To get camelCase keys, see [camelCase row keys](../guide/queries#camelcase-row-keys).

## Not supported

Unsupported syntax is a compile error with a Postgres-style message and a token position, never a silent `any`. Use `sql.as<Row>()` for anything TypeSQL rejects.

- [Limits](../guide/limits): statement size and other known gaps.
- [Postgres compatibility](../guide/postgres-compatibility): how the parser is tested against PostgreSQL's own regression suite.
