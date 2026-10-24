# Selecting data

This page shows what TypeSQL infers from a `SELECT`: column names, column types and when a column can be `NULL`. The comments in the examples show the row type the compiler reports. For the full list of supported syntax, see [Supported SQL](../reference/sql).

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

- A column keeps its name.
- A function call is named after the function.
- A cast keeps the name of what it casts.
- `CASE` is named `case`.
- Anything else is `?column?`.

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

Derived tables, `LATERAL`, `VALUES`, set-returning functions in `FROM`, cursors and more are covered in [Supported SQL](../reference/sql).

## JSON

JSON you build in SQL is typed. Nested `json_agg` subqueries can replace a second round trip:

<<< @/snippets/queries.ts#json

`json_build_object` with literal keys is an object, `json_build_array` a tuple, and `json_agg(x)` an array of `x`. In `CASE`, `COALESCE` and `UNION` the branches' shapes are combined (`{ a: number } | { b: string }`). The SQL/JSON standard syntax (`JSON_OBJECT`, `JSON_TABLE`, …) is typed too; see [Supported SQL](../reference/sql#json-and-sql-json).

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

About 450 built-in functions are typed with their argument types, return types and null handling, and every other `pg_catalog` function by its return type. See [Supported SQL](../reference/sql#functions) for what's covered.

A function Postgres would not find is an error. A close known name gives a hint:

<<< @/snippets/queries.ts#unknown-function

Declare your own functions and extension functions next to the tables, under `$functions`. The signatures use the notation of the [function catalog](../reference/api#function-catalog):

<<< @/snippets/queries.ts#functions

You can also:

- augment `FunctionCatalog`, which works for every schema and is the simplest way with the Kysely, Drizzle and Prisma schema packages;
- create the function in your [migrations](./migrations): `CREATE FUNCTION` records its return type;
- cast an untyped result: `my_fn(x)::int4`.
