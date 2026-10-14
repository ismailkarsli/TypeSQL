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

More than 380 built-in functions are typed with their Postgres return types and null handling:
string, numeric, date/time, JSON, array, aggregate and window functions. A function typesql
does not know is `unknown` rather than an error; a cast gives it a type:

<<< @/snippets/queries.ts#unknown

To type your own functions, extend the catalog; see [Function catalog](../reference/api#function-catalog).
