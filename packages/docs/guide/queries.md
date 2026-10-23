# Queries

Everything below is inferred from the SQL text alone. The comments show the row type the
compiler reports; each example is type-checked as part of this site's build.

## Joins and nullability

Columns are nullable when the schema says so, and also when an outer join can fill them with
`NULL`: the right side of a `LEFT JOIN`, the left side of a `RIGHT JOIN`, both sides of a
`FULL JOIN`. Views are read like tables.

<<< @/snippets/queries.ts#joins

`posts` is a `string` here because `count(*)`-style `int8` values are strings under
node-postgres; see [type maps](./schema#type-maps).

## Column names

Unaliased expressions get the names Postgres gives them: a column keeps its name, a function
call is named after the function, a cast keeps the name of what it casts, `CASE` is `case`, and
anything else is `?column?`. When two columns have the same name, the last one wins, as in the
row objects the drivers build.

<<< @/snippets/queries.ts#naming

### camelCase row keys

`createSql(executor, { rowKeys: "camelCase" })` renames the top-level keys of every row, in the
row types and in the rows `execute*` returns. The SQL keeps the database's names:

<<< @/snippets/queries.ts#row-keys

The mapping is the one Kysely's `CamelCasePlugin` uses by default: the first character stays,
every later `_` is dropped, and the character after a `_` is upper-cased. Nothing else changes.

| Column | Key |
|---|---|
| `created_at` | `createdAt` |
| `address_line_1` | `addressLine1` |
| `_private` | `_Private` |
| `a__b`, `trailing_` | `aB`, `trailing` |
| `HTTP_CODE` | `HTTPCODE` |
| `fooBar`, `?column?`, `count` | unchanged |

- Only the top-level keys are renamed. Values are left alone, so keys inside `json`/`jsonb`
  values stay as stored (`CamelCasePlugin` would rename those too).
- If two columns map to the same key (`user_id` and `"userId"`), the later column wins at
  runtime, as with duplicate column names. The type is then the union of both columns' types.
  Alias one of them to keep both.
- `sql.as<Row>()` asserts the row as returned, so give it camelCase keys.
- `RowOf<DB, TM, Q>` still describes the database's names. `RowType<typeof q>` is the renamed row.
- The adapters' `createSql(client, { rowKeys: "camelCase" })` take the option too, and the
  `sql` that `sql.transaction(fn)` passes keeps it.
- The types assume the driver returns the database's names, so leave driver-level renaming
  such as postgres.js' `transform: postgres.camel` off. `@typesql/kysely` already bypasses
  Kysely plugins such as `CamelCasePlugin`.

## Aggregates

`count` is never null. Other aggregates are nullable when their argument is, and also when
there is no `GROUP BY`, because an aggregate over zero rows returns `NULL`. `sum` of integers is
`int8` (or `numeric` for `int8` input), `avg` is `numeric`, as in Postgres.

<<< @/snippets/queries.ts#aggregates

Window functions work the same way: `row_number()`, `rank()` and friends are non-null `int8`;
`lag()`, `lead()` and `first_value()` are nullable.

## Subqueries, CTEs and set operations

Scalar subqueries are always nullable (they can return no row). `EXISTS` is a non-null
boolean. CTEs, including `WITH RECURSIVE`, become tables for the rest of the statement. In
`UNION`, `INTERSECT` and `EXCEPT`, column names come from the first branch, types are combined
per position, and a column is nullable if any branch can produce `NULL` there.

<<< @/snippets/queries.ts#structure

Also supported: derived tables (`FROM (SELECT …) AS t(a, b)`), `LATERAL`, `VALUES` lists,
set-returning functions such as `generate_series`, `unnest` and `jsonb_each` in `FROM`,
`DISTINCT ON`, named windows, `FOR UPDATE`, and `ORDER BY` / `GROUP BY` by alias or position.

## Whole-row references

A table alias used as a value is the whole row: `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)`,
`t IS NULL`. As in Postgres, a column of that name wins over the alias. `(t).col` reads one
column and `(t).*` expands to all of them. The row on the outer side of a join is nullable, and
so are its columns.

<<< @/snippets/queries.ts#wholerow

Selecting the row itself (`SELECT t FROM …`) gives the `record` type of the type map: the
drivers return its text form, such as `"(1,ada@example.com)"`.

## JSON

JSON built in SQL is typed: `json_build_object` with literal keys is an object,
`json_build_array` a tuple, `json_agg(x)` an array of `x`, `json_object_agg` an object with
arbitrary keys, and `to_json(t)` of a whole row an object with one key per column. They nest,
so a correlated `json_agg` subquery replaces a second round trip:

<<< @/snippets/queries.ts#json

Values inside JSON are typed the way Postgres serializes them, not by the type map:

| Postgres type | Inside JSON |
|---|---|
| `int2` … `int8`, `float4`, `float8`, `numeric` | `number` |
| `bool` | `boolean` |
| `text`, `uuid`, `date`, `timestamp(tz)`, `interval`, `bytea` (`"\\x…"`), `money`, … | `string` |
| enums | the enum's values |
| arrays, `json`, `jsonb`, whole rows | arrays, the embedded value, objects |

`json_agg` keeps `NULL` inputs as `null` elements and is `NULL` over zero rows: outside a
`GROUP BY` it is nullable, and `coalesce(json_agg(…), '[]')` makes it a plain array. In `CASE`,
`COALESCE` and `UNION` the branches' shapes are combined (`{ a: number } | { b: string }`).

`->`, `#>` and jsonb subscripts follow a known shape: a literal key or index (`-> 'tags' -> 0`,
`#> '{tags,0}'`, `['tags'][0]`) gives that member, a missing key or an index past the end gives
`null`, and a non-literal key or index any member. The result is always nullable. `->>` and
`#>>` are `string | null`. A `json` / `jsonb` column with no declared shape stays `unknown`;
declare it as a [typed JSON column](./schema#typed-json-columns) to give it one.

<<< @/snippets/queries.ts#jsonread

## Narrowing with WHERE

Conditions in `WHERE` (and in an inner join's `ON`) that rule out `NULL` make the column
non-null in the result: `IS NOT NULL`, comparisons such as `= $1` or `> 0`, `LIKE`, `IN`,
`BETWEEN`. Narrowing goes through top-level `AND` only; `OR` and `NOT` never narrow.

<<< @/snippets/queries.ts#narrowing

## Expressions and functions

Operators follow Postgres's rules: numeric promotion (`int4 + int8` is `int8`), date
arithmetic (`timestamptz - timestamptz` is an `interval`), JSON operators (`->>` is `text`),
string and array concatenation, comparisons, `IS [NOT] DISTINCT FROM`, `BETWEEN`, `LIKE`,
regular expressions, `ANY`/`ALL`, casts in both spellings, `ARRAY[…]`, subscripts and slices,
`EXTRACT`, `SUBSTRING … FROM … FOR`, `TRIM`, `POSITION`, `AT TIME ZONE`.

SQL/XML is typed too: `XMLELEMENT(NAME n, XMLATTRIBUTES(…), …)`, `XMLFOREST`, `XMLCONCAT`,
`XMLPI`, `XMLROOT`, `XMLPARSE` and `XMLEXISTS(… PASSING …)` have Postgres's types and null
handling (`XMLELEMENT` is never `NULL`, `XMLFOREST` only when every value is),
`XMLSERIALIZE(… AS type)` has the type you name, and `x IS [NOT] DOCUMENT` is a boolean.
`XMLTABLE(… PASSING doc COLUMNS …)` in `FROM` gives the declared columns: nullable unless they
are `NOT NULL`, `FOR ORDINALITY` or have a non-null `DEFAULT`.

About 450 built-in functions are typed with their Postgres argument types, return types and
null handling: string, numeric, date/time, JSON, array, aggregate and window functions,
function-style casts (`date(ts)`, `int8(x)`) and common extensions (`pgcrypto`, `uuid-ossp`,
`unaccent`, `pg_trgm`, `fuzzystrmatch`). Every other `pg_catalog` function is known with its
return type; its arguments are not checked.

A function Postgres would not find is an error, with a hint when a known name is close:

<<< @/snippets/queries.ts#unknown-function

Declare your own and extension functions next to the tables, under `$functions`. The
signatures use the notation of the [function catalog](../reference/api#function-catalog):

<<< @/snippets/queries.ts#functions

Alternatively, augment `FunctionCatalog` (for every schema, and the simplest route with the
Kysely, Drizzle and Prisma schema packages), or create the function in your
[migrations](./migrations): `CREATE FUNCTION` records its return type. A cast gives an
untyped result a type (`my_fn(x)::int4`).
