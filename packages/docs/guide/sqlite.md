# SQLite

TypeSQL types SQLite statements with the `sqlite` dialect from `@typesql/core/sqlite`. It has its own parser and type rules, written against SQLite 3.53's behavior; everything else (`sql.param`, fragments, `sql.set` / `sql.values`, `:name` parameters, transactions, `migrations()`) works as described in the rest of this guide.

```ts
import { createSql } from "@typesql/core";
import { type Col, type Generated, type Nullable, sqlite } from "@typesql/core/sqlite";

interface DB {
  users: {
    id: Generated<"integer">;
    email: Col<"text">;
    display_name: Nullable<"text">;
  };
}

const sql = createSql<DB>(sqlite);
const query = sql("SELECT id, email FROM users WHERE id = $1", 7);
```

To run queries, use [`@typesql/sqlite`](../adapters/sqlite) (node:sqlite, better-sqlite3, bun:sqlite) or a [custom executor](../adapters/custom-executor).

## Schema

Columns use SQLite's declared type names, as you would write them in `CREATE TABLE`: `Col<"integer">`, `Col<"varchar">`, `Nullable<"datetime">`. Names are case-insensitive and length arguments are dropped, so `VARCHAR(255)` is `"varchar"`. A column without a declared type is `"any"`.

A schema derived [from migrations](./migrations) follows SQLite's rules:

- `INTEGER PRIMARY KEY` is the rowid: never `NULL`, and optional on insert.
- Other `PRIMARY KEY` columns may be `NULL` unless the table is `STRICT` or `WITHOUT ROWID`, or the column is `NOT NULL`.
- `STRICT` tables accept only `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB` and `ANY`.
- `CREATE TABLE … AS SELECT` columns get the affinity names SQLite gives them (`int`, `text`, `real`, `num`) or `any`.

```ts
import { migrations } from "@typesql/core/sqlite";

const m = migrations()
  .add("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN bio TEXT");
```

Or generate the schema from a database file with [`typesql introspect --dialect sqlite`](../adapters/sqlite#generate-the-schema), or convert your [Kysely, Drizzle or Prisma schema](./orms#sqlite).

### Column flags

`Col` takes a second argument with what a migration or introspection knows about the column:

```ts
interface DB {
  posts: {
    id: Col<"integer", { position: 0; rowid: true; hasDefault: true }>;
    title: Col<"text", { position: 1 }>;
    slug: Col<"text", { position: 2; generated: true }>;
    body: Col<"text", { position: 3; nullable: true }>;
  };
}
```

| Flag | Effect |
|---|---|
| `nullable`, `hasDefault` | as in `Nullable<…>` and `Generated<…>` |
| `position` | the column's place in the table, from 0. With positions, `SELECT *` lists the columns in table order and `INSERT INTO t VALUES (…)` types each value against the right column. |
| `rowid` | the column is the `INTEGER PRIMARY KEY`, so `rowid`, `oid` and `_rowid_` resolve to it |
| `generated` | a `GENERATED ALWAYS AS` column: readable, but `INSERT` and `UPDATE` reject it, `sql.set` and `sql.values` don't accept it, and `INSERT INTO t VALUES (…)` skips it |
| `hidden` | a hidden column, such as an FTS5 table's own-name and `rank` columns: usable by name, but not in `SELECT *` |

### Typed values

`Json<T>` declares a JSON column whose documents have the shape `T`. The column still reads as text (or as the type map's `json` type), but `->>`, `->` and `json_extract` with a constant path take their types from `T`:

```ts
import type { Json, Typed } from "@typesql/core/sqlite";

interface DB {
  posts: {
    meta: Json<{ tags: string[]; views: number }, { nullable: true }>;
    status: Col<Typed<"text", "draft" | "published">>;
  };
}

sql("SELECT meta ->> '$.views' AS views, meta ->> '$.tags[0]' AS tag FROM posts");
// { views: number | null; tag: string | null }[]
```

`Typed<Type, T>` keeps a column's SQLite type (`"text"`) and types its values as `T`, for example a union of string literals for a text column used as an enum.

## Functions

The built-in functions are SQLite's core, math, date and JSON functions. Declare functions you register with your driver (better-sqlite3's `db.function()`, node:sqlite's `db.function()`) under `$functions` in the schema, or for every schema by augmenting `FunctionCatalog`:

```ts
import type { Col, Sig } from "@typesql/core/sqlite";

interface DB {
  users: { id: Col<"integer">; email: Col<"text"> };
  $functions: {
    slugify: Sig<["text"], "text">;
    pick: [Sig<["integer"], "integer">, Sig<["text", "text"], "text">];
    join_all: Sig<["text", "..."], "text", { nullable: false }>;
    median: Sig<["real"], "real", { agg: true }>;
  };
}

declare module "@typesql/core/sqlite" {
  interface FunctionCatalog {
    regexp: Sig<["text", "text"], "integer">;
  }
}
```

- `Sig<Args, Ret, Flags>` lists the argument types and the return type. A trailing `"..."` repeats the last argument type, and an array of `Sig`s is an overload set, picked by the number of arguments.
- The result is `NULL` when an argument is `NULL`. Use `{ nullable: true }` for a function that can return `NULL` for any input, and `{ nullable: false }` for one that never does.
- `{ agg: true }` makes an aggregate (`GROUP BY` rules apply, and it can't appear in `WHERE`); `{ window: true }` a window function.
- Names are matched case-insensitively, and a declared function replaces a built-in of the same name. Declaring `regexp` enables the `REGEXP` operator.

## Types

SQLite stores a value as `INTEGER`, `REAL`, `TEXT`, `BLOB` or `NULL`, and a column's declared type only sets its affinity. TypeSQL maps a type name the way SQLite picks the affinity:

| Declared type contains | Affinity | TypeScript |
|---|---|---|
| `int` (`integer`, `bigint`, `int8`, …) | integer | `number` |
| `char`, `clob`, `text` | text | `string` |
| `blob` | blob | `Uint8Array` |
| `real`, `floa`, `doub` | real | `number` |
| anything else (`numeric`, `decimal`, `boolean`) | numeric | `number` |
| nothing, or `ANY` | none | `unknown` |

Some names have numeric affinity but usually hold text, so the default map types them as `string`: `date`, `datetime`, `time`, `timestamp`, `json` and `uuid`. The type map is keyed by type name first and affinity second; pass your own to change it, for example `BigIntTypeMap` when the driver returns `bigint` (see [Type mapping](../reference/type-mapping#sqlite)).

Expressions are typed by the storage class SQLite produces: `||` is text, comparisons and `LIKE` are integers (`0` or `1`), `+` on two integers is an integer and on a real is a real, and `CAST` follows the target's affinity. When the branches of a `CASE`, `coalesce` or `UNION` have different classes, the type is a union, such as `string | number`.

## Nullability

Nullability follows SQLite, which returns `NULL` in more places than PostgreSQL:

- `a / b` and `a % b` can be `NULL` (division by zero) unless `b` is a nonzero literal.
- Math functions such as `sqrt`, `ln` and `mod`, date functions with arguments, `json_extract`, `->` and `->>` can return `NULL` for valid input.
- `sign`, `ceil`, `floor` and `trunc` return `NULL` for text that is not a number.
- An aggregate query without `GROUP BY` returns one row even for an empty table, so its bare columns and `max`, `sum`, `avg`, `group_concat` are nullable; `count` and `total` are not.
- `LEFT`, `RIGHT` and `FULL JOIN` make the outer side nullable, and `WHERE x IS NOT NULL` (or a comparison on `x`) makes `x` non-null again.

## Result columns

Row keys are the column names SQLite reports:

- A column reference is named as the column is declared: `SELECT ID FROM users` gives `id` if the table says `id`. `rowid`, `oid` and `_rowid_` are named `rowid` (or the table's `INTEGER PRIMARY KEY` column, for schemas from migrations).
- An expression without `AS` is named by its text, exactly as written: `SELECT count(*), 1 + 1` gives the keys `count(*)` and `1 + 1`.
- Duplicate names in a subquery, CTE or view get SQLite's suffixes (`id`, `id:1`).
- Unnamed `VALUES` columns are `column1`, `column2`, ….

## Parameters

Write parameters as `$1`, `$2` or `:name`, like in the PostgreSQL dialect. SQLite's own `?`, `?NNN`, `@name` and `$name` are rejected with an error that says so, because fragments and inline values are numbered with `$n`. Statements are sent as written and the adapter binds `$n` by name.

Parameters take their type from where they are used. They accept `number | bigint` for integers, `string` for text and `Uint8Array` for blobs; a parameter without context accepts any value SQLite can bind. `sql.json(value)` binds the value as JSON text, for `JSON` and `TEXT` columns and the JSON functions' document arguments.

## Statements

Supported: `SELECT` with CTEs (including `WITH RECURSIVE`), compound selects, `VALUES`, every join (`NATURAL`, `USING`, `RIGHT`, `FULL`), window functions, `json_each` and `json_tree`; `INSERT` (with `OR …`, `REPLACE`, `DEFAULT VALUES`, upserts with `excluded`, `RETURNING`), `UPDATE … FROM` and `DELETE`; and in migrations `CREATE TABLE` (and `AS SELECT`), `ALTER TABLE` (`ADD`, `RENAME`, `DROP COLUMN`), `CREATE VIEW`, `DROP`, `CREATE INDEX`, `CREATE TRIGGER`, `CREATE VIRTUAL TABLE … USING fts5(…)`. `PRAGMA`, `BEGIN`, `VACUUM` and similar statements are accepted without effect on the schema.

TypeSQL reports some statements that SQLite only rejects when they run: an `INSERT` that leaves a `NOT NULL` column without a value, and a view whose column list does not match its query.

## Errors

Errors carry SQLite's own message, and a misspelled table, column or function adds the closest match:

```
no such column: emial. Perhaps you meant the column "email"?
```

## Compatibility testing

`pnpm test:sqlite` runs every statement of `packages/core/test/sqlite/corpus.json` through TypeSQL and through the SQLite that ships with Node, and compares the outcome, the error message, the result column names and declared types, and the values returned for seeded tables against the inferred types. Reviewed disagreements are in `packages/core/test/sqlite/baseline.json`; they are the deliberate differences above. `pnpm fuzz` also generates random expressions and queries from a seed and runs them through the same comparison.

## Limits

- For tables declared in TypeScript without `position` flags, TypeSQL does not know the column order, so `SELECT *` lists columns in an unspecified order and `INSERT INTO t VALUES (…)` without a column list may type its values against the wrong columns. Name the columns, add [`position`](#column-flags), or derive the schema [from migrations](./migrations) or [introspection](../adapters/sqlite#generate-the-schema), which record the order.
- `sql.values()` cannot leave a column out of some rows, because SQLite has no `DEFAULT` inside `VALUES`; it throws. Give every row the same columns.
- `ON CONFLICT` targets are not checked against the table's unique constraints, and `WITHOUT ROWID` tables still accept `rowid`.
