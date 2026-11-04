---
description: "What TypeSQL infers from a SELECT: column names, column types, and when joins, aggregates, subqueries and expressions make a column nullable."
---

# Selecting data

This page shows what TypeSQL infers from a `SELECT`: column names, column types and when a column can be `NULL`. The comments in the examples show the row type the compiler reports.

## Joins and nullability

A column is nullable when the schema says so. It is also nullable when an outer join can fill it with `NULL`:

- the right side of a `LEFT JOIN`
- the left side of a `RIGHT JOIN`
- both sides of a `FULL JOIN`

```ts
const joined = sql(`
  SELECT u.email, p.title, s.posts
  FROM users u
  LEFT JOIN posts p ON p.author_id = u.id
  JOIN user_stats s ON s.user_id = u.id`);
```

Views are read like tables. `posts` is a `string` here because `count(*)`-style `int8` values are strings under node-postgres; on SQLite it is a `number`. See [Type mapping](../reference/type-mapping).

## Narrowing with WHERE

A condition that rules out `NULL` makes the column non-null in the result. This works in `WHERE` and in an inner join's `ON`.

```ts
const withTitles = sql(`
  SELECT u.email, p.title
  FROM users u LEFT JOIN posts p ON p.author_id = u.id
  WHERE p.title IS NOT NULL`);
```

These conditions narrow: `IS NOT NULL`, comparisons such as `= $1` or `> 0`, `LIKE`, `IN` and `BETWEEN`.

Narrowing only goes through a top-level `AND`. `OR` and `NOT` never narrow.

## Column names

A column you don't alias gets the name the database gives it:

::: code-group

```ts [PostgreSQL]
const named = sql(`
  SELECT id + 1, lower(email), id::text, count(*) OVER (),
         CASE WHEN id > 10 THEN 'big' END,
         coalesce(display_name, email) AS name
  FROM users`);
// { "?column?": number; lower: string; id: string; count: string; case: string | null; name: string }
```

```ts [SQLite]
const named = sql(`
  SELECT id + 1, lower(email), CAST(id AS TEXT), count(*) OVER (),
         CASE WHEN id > 10 THEN 'big' END,
         coalesce(display_name, email) AS name
  FROM users`);
// { "id + 1": number; "lower(email)": string; "CAST(id AS TEXT)": string;
//   "count(*) OVER ()": number; "CASE WHEN id > 10 THEN 'big' END": string | null; name: string }
```

:::

SQLite names an expression by its text, exactly as written; see [SQLite result columns](./sqlite#result-columns). Postgres names it by the rules below:

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

For camelCase keys, see [CasePlugin](./case-plugin).

## Aggregates

`count` is never null. Other aggregates are nullable when their argument is nullable. Without a `GROUP BY` they are always nullable, because an aggregate over zero rows returns `NULL`.

```ts
const totals = sql(
	`SELECT author_id, count(*) AS n, max(title) AS last FROM posts GROUP BY author_id`,
);
const overall = sql(`SELECT count(*) AS n, max(title) AS last FROM posts`);
```

Result types follow the database. On Postgres, `sum` of integers is `int8` (`numeric` for `int8` input), and `avg` is `numeric`. On SQLite, `sum` of integers is an integer and `avg` a real, and an aggregate without `GROUP BY` also makes the bare columns next to it nullable.

Window aggregates also account for frames that can be empty. `row_number()`, `rank()` and similar functions are non-null `int8`. `lag()` and `lead()` without a default are nullable; with a non-null value and a non-null default, they are non-null. `first_value()`, `last_value()` and `nth_value()` are nullable because their frame may contain no matching row.

## Subqueries, CTEs and set operations

```ts
const structured = sql(`
  WITH active AS (
    SELECT author_id, count(*) AS n FROM posts GROUP BY author_id
  )
  SELECT u.email,
         (SELECT max(p.title) FROM posts p WHERE p.author_id = u.id) AS latest,
         EXISTS (SELECT 1 FROM active a WHERE a.author_id = u.id) AS has_posts
  FROM users u
  UNION ALL
  SELECT 'nobody', NULL, false`);
```

- A scalar subquery is always nullable, because it can return no row.
- `EXISTS` is a non-null boolean.
- A CTE, including `WITH RECURSIVE`, works like a table for the rest of the statement.
- In `UNION`, `INTERSECT` and `EXCEPT`, column names come from the first branch. A column is nullable if any branch can return `NULL` there.
- `ROWS FROM (f(…), g(…))` zips its functions, so every column is nullable.
- `DECLARE c CURSOR FOR query` checks the query, but `FETCH` has no row type, because the cursor's query is another statement. Assert one with `sql.as<Row>("FETCH 10 FROM c")`.

## JSON

This section is about PostgreSQL. On SQLite, `json_object`, `json_array` and `json_group_array` return JSON text, typed as `string`, and a [typed JSON column](./schema#typed-json-columns) gives `->`, `->>` and `json_extract` their types.

JSON you build in SQL is typed. Nested `json_agg` subqueries can replace a second round trip:

```ts
const profiles = sql(`
  SELECT u.id,
         json_build_object('email', u.email, 'since', u.created_at) AS profile,
         coalesce((SELECT json_agg(p ORDER BY p.id) FROM posts p WHERE p.author_id = u.id), '[]') AS posts
  FROM users u`);
```

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

```ts
const firstTags = sql(`
  SELECT j -> 'tags' -> 0 AS first_tag, j ->> 'title' AS title
  FROM (SELECT json_build_object('title', title, 'tags', tags) AS j FROM posts) s`);
```

- A literal key or index (`-> 'tags' -> 0`, `#> '{tags,0}'`, `['tags'][0]`) gives that member.
- A missing key, or an index past the end, gives `null`.
- A key or index that is not a literal gives any member.
- The result is always nullable. `->>` and `#>>` are `string | null`.

A `json` or `jsonb` column with no declared shape stays `unknown`. Declare it as a [typed JSON column](./schema#typed-json-columns) to give it one. Typed JSON needs literal keys and paths; see [Limits](./limits).

## Whole-row references

A table alias used as a value is the whole row: `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)`, `t IS NULL`.

```ts
const withPosts = sql(`
  SELECT u.email, (p).title, p IS NULL AS no_posts
  FROM users u LEFT JOIN posts p ON p.author_id = u.id`);
```

- `(t).col` reads one column, and `(t).*` expands to all of them.
- As in Postgres, a column with the alias's name wins over the alias.
- A row on the outer side of a join is nullable, and so are its columns.
- `SELECT t FROM …` gives the type map's `record` type. The drivers return its text form, such as `"(1,ada@example.com)"`.

## Expressions and functions

Operators follow Postgres's rules. For example, `int4 + int8` is `int8`, `timestamptz - timestamptz` is an `interval`, and `->>` is `text`.

About 450 built-in functions have signatures with return types and null handling, including those of `pgcrypto`, `uuid-ossp`, `unaccent`, `pg_trgm` and `fuzzystrmatch`. A signature picks the overload and the return type, but argument types are not checked against it: `lower(id)` on an `int4` column compiles as `string`, while PostgreSQL rejects it. Comparison operators reject incompatible known column types, such as `id = email` between `int4` and `text`, but literals, parameters, enums, arrays and domains are more permissive (`email = 1` compiles). Every other `pg_catalog` function is known by its return type only.

A function Postgres would not find is an error. A close known name gives a hint:

```ts
sql(`SELECT slugify(email) AS slug FROM users`);
```

Declare your own functions and extension functions next to the tables, under `$functions`. The signatures use the notation of the [function catalog](../reference/api#function-catalog):

::: code-group

```ts [PostgreSQL]
interface AppDB extends DB {
	$functions: {
		slugify: Sig<["text"], "text">;
		rank_in: Sig<["int4", "..."], "int8", { nullable: false }>;
	};
}
const appSql = createSql<AppDB>(postgres);
const slugs = appSql(
	`SELECT slugify(email) AS slug, slugify(display_name) AS alt, rank_in(id, 1, 2) AS r FROM users`,
);
```

```ts [SQLite]
interface AppDB extends DB {
	$functions: {
		slugify: Sig<["text"], "text">;
		rank_in: Sig<["integer", "..."], "integer", { nullable: false }>;
	};
}
const appSql = createSql<AppDB>(sqlite);
const slugs = appSql(
	`SELECT slugify(email) AS slug, slugify(display_name) AS alt, rank_in(id, 1, 2) AS r FROM users`,
);
```

:::

On SQLite, register the function with your driver too (`db.function()` in node:sqlite and better-sqlite3); see [SQLite functions](./sqlite#functions).

You can also:

- augment `FunctionCatalog`, which works for every schema and is the simplest way with the Kysely, Drizzle and Prisma schema packages;
- create the function in your [migrations](./migrations): `CREATE FUNCTION` records its return type;
- cast an untyped result: `my_fn(x)::int4`.
