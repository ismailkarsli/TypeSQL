# Selecting data

This page shows what TypeSQL infers from a `SELECT`: column names, column types and when a column can be `NULL`. The comments in the examples show the row type the compiler reports.

## Joins and nullability

A column is nullable when the schema says so. It is also nullable when an outer join can fill it with `NULL`:

- the right side of a `LEFT JOIN`
- the left side of a `RIGHT JOIN`
- both sides of a `FULL JOIN`

<<< @/snippets/queries.ts#joins

Views are read like tables. `posts` is a `string` here because `count(*)`-style `int8` values are strings under node-postgres. See [Type mapping](../reference/type-mapping).

## Narrowing with WHERE

A condition that rules out `NULL` makes the column non-null in the result. This works in `WHERE` and in an inner join's `ON`.

<<< @/snippets/queries.ts#narrowing

These conditions narrow: `IS NOT NULL`, comparisons such as `= $1` or `> 0`, `LIKE`, `IN` and `BETWEEN`.

Narrowing only goes through a top-level `AND`. `OR` and `NOT` never narrow.

## Column names

A column you don't alias gets the name Postgres gives it:

<<< @/snippets/queries.ts#naming

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

When two columns have the same name, the last one wins. The drivers build their row objects the same way.

### camelCase row keys

Pass `{ rowKeys: "camelCase" }` to `createSql` to get camelCase keys. The row types and the rows `execute*` returns both change. The SQL keeps the database's names.

<<< @/snippets/queries.ts#row-keys

The mapping is the default of Kysely's `CamelCasePlugin`: the first character stays, every later `_` is dropped, and the character after a `_` becomes upper case.

| Column | Key |
|---|---|
| `created_at` | `createdAt` |
| `address_line_1` | `addressLine1` |
| `_private` | `_Private` |
| `a__b`, `trailing_` | `aB`, `trailing` |
| `HTTP_CODE` | `HTTPCODE` |
| `fooBar`, `?column?`, `count` | unchanged |

Things to know:

- Only top-level keys are renamed. Keys inside `json` and `jsonb` values stay as stored.
- If two columns map to the same key (`user_id` and `"userId"`), the later one wins at runtime and the type is the union of both. Alias one of them to keep both.
- `sql.as<Row>()` takes the row as returned, so give it camelCase keys.
- `RowOf<DB, TM, Q>` still uses the database's names. `RowType<typeof q>` is the renamed row.
- The adapters' `createSql(client, { rowKeys: "camelCase" })` take the option too, and `tx` inside `sql.transaction(fn)` keeps it.
- Turn off renaming in the driver, such as postgres.js' `transform: postgres.camel`. The types assume the driver returns the database's names. `@typesql/kysely` already bypasses Kysely plugins such as `CamelCasePlugin`.

## Aggregates

`count` is never null. Other aggregates are nullable when their argument is nullable. Without a `GROUP BY` they are always nullable, because an aggregate over zero rows returns `NULL`.

<<< @/snippets/queries.ts#aggregates

Result types follow Postgres: `sum` of integers is `int8` (`numeric` for `int8` input), and `avg` is `numeric`.

Window functions work the same way. `row_number()`, `rank()` and similar functions are non-null `int8`. `lag()`, `lead()` and `first_value()` are nullable.

## Subqueries, CTEs and set operations

<<< @/snippets/queries.ts#structure

- A scalar subquery is always nullable, because it can return no row.
- `EXISTS` is a non-null boolean.
- A CTE, including `WITH RECURSIVE`, works like a table for the rest of the statement.
- In `UNION`, `INTERSECT` and `EXCEPT`, column names come from the first branch. A column is nullable if any branch can return `NULL` there.
- `ROWS FROM (f(…), g(…))` zips its functions, so every column is nullable.
- `DECLARE c CURSOR FOR query` checks the query, but `FETCH` has no row type, because the cursor's query is another statement. Assert one with `sql.as<Row>("FETCH 10 FROM c")`.

## JSON

JSON you build in SQL is typed. Nested `json_agg` subqueries can replace a second round trip:

<<< @/snippets/queries.ts#json

`json_build_object` with literal keys is an object, `json_build_array` a tuple, and `json_agg(x)` an array of `x`. In `CASE`, `COALESCE` and `UNION` the branches' shapes are combined (`{ a: number } | { b: string }`). The SQL/JSON standard syntax is typed too:

- `JSON_OBJECT` and `JSON_ARRAY` are typed like `json_build_object` and `json_build_array`, but are never `NULL`.
- `JSON_ARRAYAGG` and `JSON_OBJECTAGG` are typed like `json_agg` and `json_object_agg`.
- `JSON_VALUE` is `text` or its `RETURNING` type, `JSON_QUERY` is `jsonb`, and `JSON_EXISTS` and `IS JSON` are `bool`.
- `JSON_TABLE` columns are nullable, except a top-level `FOR ORDINALITY`. Likewise, `XMLTABLE` columns are nullable unless they are `NOT NULL`, `FOR ORDINALITY` or have a non-null `DEFAULT`.

Values inside JSON are typed the way Postgres writes them as JSON, not by the type map:

| Postgres type | Inside JSON |
|---|---|
| `int2` … `int8`, `float4`, `float8`, `numeric` | `number` |
| `bool` | `boolean` |
| `text`, `uuid`, `date`, `timestamp(tz)`, `interval`, `bytea` (`"\\x…"`), `money`, … | `string` |
| enums | the enum's values |
| arrays, `json`, `jsonb`, whole rows | arrays, the embedded value, objects |

`json_agg` returns `NULL` over zero rows, so outside a `GROUP BY` it is nullable. `coalesce(json_agg(…), '[]')` makes it a plain array. `NULL` inputs stay as `null` elements.

### Reading JSON

`->`, `#>` and jsonb subscripts follow a known shape:

<<< @/snippets/queries.ts#jsonread

- A literal key or index (`-> 'tags' -> 0`, `#> '{tags,0}'`, `['tags'][0]`) gives that member.
- A missing key, or an index past the end, gives `null`.
- A key or index that is not a literal gives any member.
- The result is always nullable. `->>` and `#>>` are `string | null`.

A `json` or `jsonb` column with no declared shape stays `unknown`. Declare it as a [typed JSON column](./schema#typed-json-columns) to give it one. Typed JSON needs literal keys and paths; see [Limits](./limits).

## Whole-row references

A table alias used as a value is the whole row: `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)`, `t IS NULL`.

<<< @/snippets/queries.ts#wholerow

- `(t).col` reads one column, and `(t).*` expands to all of them.
- As in Postgres, a column with the alias's name wins over the alias.
- A row on the outer side of a join is nullable, and so are its columns.
- `SELECT t FROM …` gives the type map's `record` type. The drivers return its text form, such as `"(1,ada@example.com)"`.

## Expressions and functions

Operators follow Postgres's rules. For example, `int4 + int8` is `int8`, `timestamptz - timestamptz` is an `interval`, and `->>` is `text`.

About 450 built-in functions are typed with their argument types, return types and null handling, including those of `pgcrypto`, `uuid-ossp`, `unaccent`, `pg_trgm` and `fuzzystrmatch`. Every other `pg_catalog` function is known by its return type, without checking its arguments.

A function Postgres would not find is an error. A close known name gives a hint:

<<< @/snippets/queries.ts#unknown-function

Declare your own functions and extension functions next to the tables, under `$functions`. The signatures use the notation of the [function catalog](../reference/api#function-catalog):

<<< @/snippets/queries.ts#functions

You can also:

- augment `FunctionCatalog`, which works for every schema and is the simplest way with the Kysely, Drizzle and Prisma schema packages;
- create the function in your [migrations](./migrations): `CREATE FUNCTION` records its return type;
- cast an untyped result: `my_fn(x)::int4`.
