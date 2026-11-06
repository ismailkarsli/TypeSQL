---
description: "Run TypeSQL on node:sqlite, better-sqlite3 or bun:sqlite with @typesql/sqlite, and how the sqlite dialect types schemas, functions, values, nullability and parameters."
---

# SQLite

`@typesql/sqlite` runs queries on node:sqlite, better-sqlite3 or bun:sqlite, and the `sqlite` dialect from `@typesql/core/sqlite` types them with SQLite 3.53's rules.

```sh
pnpm add @typesql/core @typesql/sqlite
```

## Run queries

Pass your node:sqlite, better-sqlite3 or bun:sqlite database to `createSql`:

```ts
import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const sql = createSql<DB>(new DatabaseSync("app.db"));
const posts = await sql(
  `SELECT id, title FROM posts WHERE author_id = ${sql.param(1)}`,
).execute();
```

- `true` / `false` are sent as `1` / `0`, and a `Date` throws; pass `date.toISOString()` instead.
- bun:sqlite binds whole numbers as INTEGER and the others as REAL, so pass a `bigint` where integer arithmetic matters.
- Attach [`CasePlugin`](../guide/case-plugin) for camelCase keys.

## Schema

Columns use SQLite's declared type names (`Col<"integer">`, `Col<"varchar">`), and a column without a type is `"any"`.

```ts
import type { Col } from "@typesql/core/sqlite";

interface DB {
  users: {
    id: Col<"integer", { hasDefault: true; rowid: true }>;
    email: Col<"text">;
    display_name: Col<"text", { nullable: true }>;
  };
}
```

### Column flags

| Flag | Effect |
|---|---|
| `nullable`, `hasDefault` | `NULL` allowed; optional in `INSERT` |
| `position` | column order, used by `SELECT *` and `INSERT … VALUES` without a column list once every column has one |
| `rowid` | the `INTEGER PRIMARY KEY`, so `rowid` resolves to it |
| `generated` | readable, but rejected in `INSERT` and `UPDATE` |
| `hidden` | usable by name, but not in `SELECT *` |

### Typed values

`Json<T>` types a JSON column's `->>`, `->` and `json_extract`, and `Typed<"text", T>` types a text column's values as `T`.

```ts
import type { Json, Typed } from "@typesql/core/sqlite";

interface DB {
  posts: {
    meta: Json<{ tags: string[]; views: number }, { nullable: true }>;
    status: Col<Typed<"text", "draft" | "published">>;
  };
}
```

## Generate the schema

`typesql introspect` reads a database file and writes its schema, including column order, rowid and generated columns.

```sh
pnpm add -D @typesql/cli
pnpm exec typesql introspect --db app.db --out src/db/schema.ts
```

Other options (`--exclude`, `--type-name`, `--import-from`) are as in [From a live database](../guide/introspect#options).

## Types

Types follow SQLite's affinity: `int` names are `number`, `char` / `text` are `string`, `blob` is `Uint8Array`, and `date`, `datetime`, `json` and `uuid` are `string`. See [Type mapping](../reference/type-mapping#sqlite).

## Functions

SQLite's core, math, date and JSON functions are built in, and functions you register with your driver go under `$functions`:

```ts
interface DB {
  $functions: {
    slugify: Sig<["text"], "text">;
    median: Sig<["real"], "real", { agg: true }>;
  };
}
```

## Nullability

SQLite returns `NULL` in more places than Postgres: division, math and date functions, `json_extract`, and aggregates without `GROUP BY` are nullable.

## Result columns

An unaliased expression is named by its text (`count(*)`), and duplicate names in subqueries get suffixes (`id:1`).

## Parameters

Use `$1`, `:name` or `${sql.param()}`; SQLite's `?` and `@name` are rejected, and lists go through `sql.json()` and `json_each`.

## Integers as `bigint`

Pass `{ bigint: true }` to `createSql` to read integers as `bigint`, which you need for values beyond `Number.MAX_SAFE_INTEGER`.

## Transactions

`sql.transaction(fn)` works as [on every adapter](../guide/using-sql#transactions); top-level transactions on one database run one after another.

## Migrations

On Node, give the [migrator](../guide/migrations#the-migrator) the file as `db`; elsewhere pass `executor(database)` as `execute`:

```ts
import { Database } from "bun:sqlite";
import { createMigrator } from "@typesql/core/migration";
import { executor } from "@typesql/sqlite";

await createMigrator({
	dialect: "sqlite",
	execute: executor(new Database("app.db")),
	migrations: [createUsers, addBio],
}).latest();
```

## Limits

- Without `position` flags, `SELECT *` order is unspecified and `INSERT INTO t VALUES (…)` without a column list checks only the number of values and types its parameters as `unknown`, so name your columns or generate the schema.
- `sql.values()` rows must all have the same keys, because SQLite has no `DEFAULT` inside `VALUES`.
- `ON CONFLICT` targets aren't checked against unique constraints.
