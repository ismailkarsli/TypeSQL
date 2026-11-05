---
description: "Write typed SELECT, INSERT, UPDATE, DELETE and MERGE statements with TypeSQL: nullability, parameters, write helpers, dynamic SQL and transactions."
---

# Using `sql`

`createSql<DB>(client)` from your adapter gives you `sql`. Call it with a SQL string and it checks the statement against `DB` at compile time and returns a typed query; nothing runs until you call an `execute*` method.

::: code-group

```ts [PostgreSQL]
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const sql = createSql<DB>(new Pool());

const query = sql(`SELECT id, email, display_name FROM users`);
const rows = await query.execute();
// { id: number; email: string; display_name: string | null }[]
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const sql = createSql<DB>(new DatabaseSync("app.db"));

const query = sql(`SELECT id, email, display_name FROM users`);
const rows = await query.execute();
// { id: number; email: string; display_name: string | null }[]
```

```ts [MySQL]
import { createPool } from "mysql2/promise";
import { createSql } from "@typesql/mysql";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));

const query = sql(`SELECT id, email, display_name FROM users`);
const rows = await query.execute();
// { id: number; email: string; display_name: string | null }[]
```

:::

| Method | Returns |
|---|---|
| `execute()` | every row |
| `executeTakeFirst()` | the first row, or `undefined` |
| `executeTakeFirstOrThrow()` | the first row, or throws `NoResultError` |
| `executeCount()` | the number of affected or returned rows |

A wrong table, column or type is a compile error on the SQL string; see [Errors](./errors).

## Parameters

Values are always sent as parameters, typed from where they are used:

| Style | Example | Values |
|---|---|---|
| Inline | ``WHERE id = ${sql.param(id)}`` | written in the SQL template |
| Positional | `WHERE id = $1` | arguments after the SQL |
| Named | `WHERE id = :id` | one object |

```ts
const inline = sql(`SELECT id, email FROM users WHERE id = ${sql.param(userId)}`);
const byId = sql("SELECT id, email FROM users WHERE id = $1", 7);
const byEmail = sql("SELECT id FROM users WHERE email = :email", { email: "a@b.c" });

sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`); // error: expects number
```

- A `sql.param()` value belongs to one statement; a `:name` used twice is one parameter.
- `null` is accepted wherever the database accepts it, except for `NOT NULL` columns.
- The SQL must be a literal (constants are folded in), so a value can't end up in the SQL text by accident; tagged templates aren't supported.

### JSON values

Wrap `json` and `jsonb` values in `sql.json(value)` on every database, because drivers send raw arrays and strings in ways Postgres rejects or stores wrong; on SQLite, MySQL and MariaDB it binds the value as JSON text.

```ts
const save = sql(
	`UPDATE portfolio SET history = ${sql.json(history)} WHERE id = ${sql.param(1)}`,
);
```

## Selecting data

### Joins and nullability

A column is nullable when the schema says so, or when an outer join can fill it with `NULL` (the right side of `LEFT JOIN`, the left of `RIGHT JOIN`, both sides of `FULL JOIN`).

```ts
const joined = sql(`
  SELECT u.email, p.title, s.posts
  FROM users u
  LEFT JOIN posts p ON p.author_id = u.id
  JOIN user_stats s ON s.user_id = u.id`);
```

`IS NOT NULL`, comparisons, `LIKE`, `IN` and `BETWEEN` in `WHERE` or an inner join's `ON` make a column non-null, but only through a top-level `AND`.

```ts
const withTitles = sql(`
  SELECT u.email, p.title
  FROM users u LEFT JOIN posts p ON p.author_id = u.id
  WHERE p.title IS NOT NULL`);
```

### Column names

An unaliased column gets the name the database gives it: SQLite, MySQL and MariaDB use the expression's text, Postgres uses the column or function name (`lower`, `count`) or `?column?`.

::: code-group

```ts [PostgreSQL]
const named = sql(`
  SELECT id + 1, lower(email), id::text, count(*) OVER (),
         coalesce(display_name, email) AS name
  FROM users`);
// { "?column?": number; lower: string; id: string; count: string; name: string }
```

```ts [SQLite]
const named = sql(`
  SELECT id + 1, lower(email), CAST(id AS TEXT), count(*) OVER (),
         coalesce(display_name, email) AS name
  FROM users`);
// { "id + 1": number; "lower(email)": string; "CAST(id AS TEXT)": string;
//   "count(*) OVER ()": number; name: string }
```

```ts [MySQL]
const named = sql(`
  SELECT id + 1, lower(email), CAST(id AS CHAR), count(*) OVER (),
         coalesce(display_name, email) AS name
  FROM users`);
// { "id + 1": number; "lower(email)": string; "CAST(id AS CHAR)": string;
//   "count(*) OVER ()": number; name: string }
```

:::

When two columns share a name, the last one wins. For camelCase keys, see [CasePlugin](./case-plugin).

### Aggregates

`count` is never null, other aggregates are nullable when their argument is or when there is no `GROUP BY`, and result types follow the database (`sum` of `int4` is `int8` on Postgres, and `SUM` of an integer is `decimal` on MySQL and MariaDB).

```ts
const totals = sql(
	`SELECT author_id, count(*) AS n, max(title) AS last FROM posts GROUP BY author_id`,
);
```

### Subqueries, CTEs and set operations

Scalar subqueries are nullable, `EXISTS` is a non-null boolean, CTEs work like tables, and `UNION` takes names from its first branch and nullability from all of them.

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

### JSON

On Postgres, JSON you build in SQL is typed (`json_build_object` is an object, `json_agg(x)` an array of `x`), and `->` reads a known shape; on SQLite, JSON functions return `string`, and on MySQL and MariaDB `json`, which is `unknown` when the driver parses it (see [Type mapping](../reference/type-mapping#mysql-and-mariadb)).

```ts
const profiles = sql(`
  SELECT u.id,
         json_build_object('email', u.email, 'since', u.created_at) AS profile,
         coalesce((SELECT json_agg(p ORDER BY p.id) FROM posts p WHERE p.author_id = u.id), '[]') AS posts
  FROM users u`);
```

Values inside JSON are typed as Postgres writes them (numbers, booleans, strings), and a `json` column with no declared shape is `unknown` until you make it a [typed JSON column](./schema#typed-json-columns).

### Expressions and functions

Operators and the built-in functions (about 450 on Postgres) return the types the database gives them, and an unknown function is an error; declare your own under `$functions`:

```ts
interface AppDB extends DB {
	$functions: {
		slugify: Sig<["text"], "text">;
	};
}
const appSql = createSql<AppDB>(postgres);
const slugs = appSql(`SELECT slugify(email) AS slug FROM users`);
```

On SQLite, also register the function with your driver; see [SQLite functions](../adapters/sqlite#functions). On MySQL and MariaDB, declare stored functions and UDFs the same way, with `Sig` from `@typesql/core/mysql`; see [MySQL functions](../adapters/mysql#functions).

## Inserting and updating

`INSERT`, `UPDATE`, `DELETE` and `MERGE` (`REPLACE` and `ON DUPLICATE KEY UPDATE` on MySQL and MariaDB) are checked like queries, and every `NOT NULL` column without a default must be set; without `RETURNING`, `execute()` resolves to `[]` and `executeCount()` gives the affected rows.

```ts
const created = sql(`
  INSERT INTO users (email, display_name, mood)
  VALUES (${sql.param("a@b.c")}, ${sql.param(null)}, ${sql.param("happy")})
  RETURNING id, created_at`);
```

### Optional values

`sql.param(sql.optional(value))` sends `DEFAULT` when the value is `undefined` (Postgres, MySQL and MariaDB; SQLite has no `DEFAULT` there).

```ts
declare const mood: "happy" | "neutral" | "sad" | undefined;
const signup = sql(`
  INSERT INTO users (email, mood)
  VALUES (${sql.param("a@b.c")}, ${sql.param(sql.optional(mood))})
  RETURNING id, mood`);
```

### Partial updates: `sql.set`

`sql.set(table, values)` builds a `SET` list from an object and skips `undefined` keys.

```ts
declare const patch: { display_name?: string | null; mood?: "happy" | "neutral" | "sad" };
const patched = sql(
	`UPDATE users SET ${sql.set("users", patch)} WHERE id = ${sql.param(7)} RETURNING id`,
);
```

### Bulk inserts: `sql.values`

`sql.values(table, rows)` builds the column list and `VALUES` rows from an array of objects. On Postgres, MySQL and MariaDB, a column some rows leave out is sent as `DEFAULT` (a row with no values is `() VALUES ()` on MySQL and MariaDB); on SQLite, every row needs the same keys.

```ts
declare const imported: { email: string; display_name?: string | null }[];
const inserted = sql(
	`INSERT INTO users ${sql.values("users", imported)} ON CONFLICT (email) DO NOTHING RETURNING id`,
);
```

::: warning Mass assignment
`sql.set` and `sql.values` write every key the object has at runtime, so validate untrusted input with a strict schema (Zod's `.strict()`, Valibot's `v.strictObject()`) first.
:::

## Dynamic SQL

### Fragments

`sql.fragment()` builds a piece of SQL you interpolate as `${fragment}`, and the finished statement is checked as a whole.

```ts
const recent = sql.fragment(`u.id > ${sql.param(10)}`);
const q = sql(`SELECT ${sql.id("display_name")} FROM users u WHERE ${recent}`);
```

- `sql.id()` quotes an identifier (with backticks on MySQL and MariaDB, as do `sql.set()` and `sql.values()`), `sql.and()` / `sql.or()` join conditions, `sql.combine()` joins a list, and a whole query can be a subquery.
- Fragments aren't wrapped in parentheses, so put them in yourself around `OR`.
- Allowlist names before `sql.id()`, and never pass user input as `sql.combine()`'s separator.

### Optional pieces

`${sql.optional(fragment)}` and `${sql.if(value, (v) => fragment)}` splice nothing when the fragment is absent, and the statement is checked both ways.

```ts
declare const titlePrefix: string | undefined;
const posts = sql(
	`SELECT p.id FROM posts p WHERE p.author_id = ${sql.param(7)} ${sql.if(titlePrefix, (t) => sql.fragment(`AND p.title LIKE ${sql.param(`${t}%`)}`))}`,
);
```

### Lists from runtime arrays

`sql.combine`, `sql.and` and `sql.or` accept arrays built at runtime as long as each element's text is known at compile time.

```ts
const SORT = { title: sql.fragment("p.title"), author: sql.fragment("p.author_id") } as const;
declare const sortBy: (keyof typeof SORT)[];
const order = sql.combine([...sortBy.map((f) => SORT[f]), sql.fragment("p.id")]);
const sorted = sql(`SELECT p.id, p.title FROM posts p ORDER BY ${order}`);
```

An empty `sql.combine` throws, so keep a fixed element like `p.id`.

### Fully dynamic SQL

When the SQL is only known at runtime (`sql.raw`), use `sql.as<Row>(…)` and state the row type yourself; never put user input in `sql.raw`.

```ts
declare const columns: string;
const dynamic = sql.as<{ [column: string]: unknown }>(`SELECT ${sql.raw(columns)} FROM users`);
```

## Transactions

`sql.transaction(fn)` commits when `fn` resolves and rolls back when it throws; `tx.transaction(fn)` nests with a savepoint.

```ts
const userId = await sql.transaction(async (tx) => {
	const { id } = await tx(
		`INSERT INTO users (email) VALUES (${tx.param("ada@example.com")}) RETURNING id`,
	).executeTakeFirstOrThrow();
	await tx(
		`INSERT INTO posts (author_id, title) VALUES (${tx.param(id)}, ${tx.param("Hello")})`,
	).execute();
	return id;
});
```

::: warning
Run statements in a transaction one after another, not with `Promise.all`.
:::
