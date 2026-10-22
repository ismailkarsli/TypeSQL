# @typesql/pg

[node-postgres](https://node-postgres.com) (`pg` 8.x) adapter for
[`@typesql/core`](https://www.npmjs.com/package/@typesql/core): a `createSql` bound to the type
map of `pg`'s default parsers, and helpers that run a query and return rows typed from it.

```sh
pnpm add @typesql/core @typesql/pg pg
```

## Usage

```ts
import { Pool } from "pg";
import { createSql, execute, many, maybeOne, one, query, transaction } from "@typesql/pg";
import type { DB } from "./schema";

const pool = new Pool();
const sql = createSql<DB>();

const users = await query(pool, sql("SELECT id, email FROM users")); // { id: number; email: string }[]
const user = await one(pool, sql("SELECT id, email FROM users WHERE id = $1", 7)); // exactly one row, or throws
const maybe = await maybeOne(pool, sql("SELECT id FROM users WHERE email = $1", "x")); // row | null
const some = await many(pool, sql("SELECT id FROM posts")); // at least one row, or throws
const changed = await execute(pool, sql("UPDATE users SET display_name = NULL")); // row count

const id = await transaction(pool, async (client) => {
  const { id } = await one(client, sql("INSERT INTO users (email) VALUES ($1) RETURNING id", "a@b.c"));
  await execute(client, sql("INSERT INTO posts (author_id, title) VALUES ($1, $2)", id, "Hello"));
  return id;
});
```

## API

| Export | |
|---|---|
| `createSql<DB>(pool?, options?)` | core's `createSql<DB, PgTypeMap>()`; `{ rowKeys: "camelCase" }` camelCases the row keys |
| `query(client, q)` | `Promise<Row[]>` |
| `one(client, q)` | `Promise<Row>`; `RowCountError` unless exactly one row |
| `maybeOne(client, q)` | `Promise<Row \| null>`; `RowCountError` on more than one row |
| `many(client, q)` | `Promise<[Row, ...Row[]]>`; `RowCountError` on zero rows |
| `execute(client, q)` | `Promise<number>`, the affected row count |
| `executor(client)` | an `Executor` for `q.execute()` and `q.executeCount()` (reports `rowCount`); `createSql<DB>(pool)` binds one |
| `transaction(pool, fn)` | `BEGIN`, `fn(client)`, `COMMIT`; `ROLLBACK` and rethrow on error |
| `migrate(pool, m)` | runs `m.statements` (e.g. from core's `migrations()`) in one transaction |
| `PgTypeMap`, `PgParamTypeMap`, `PgInterval` | the type map (rows), what parameters also accept, and the `postgres-interval` object type |
| `RowCountError`, `PgQueryable`, `PgPoolLike`, `PgTransactionClient`, `PgResult`, `MigrationSource` | errors and parameter types |

`client` is anything with `query(text, values)`: a `Pool`, `Client` or `PoolClient`. The
parameters are structural, so fakes work in tests.

## `typesql introspect`

Generates the schema from a live database: tables, views, materialized views and enums, with
the exact Postgres type of every column (domains as their base type), nullability, defaults,
identity and generated columns, other schemas nested, and TypeScript types for JSON columns
from a config file.

```sh
pnpm exec typesql introspect --url postgres://localhost/app --out src/db/schema.ts
pnpm exec typesql introspect --schema public,auth --config typesql.config.ts
```

The same is available from code as `introspect(client)` and `generateSource(db)` in
`@typesql/pg/introspect`. See the
[Introspection guide](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/guide/introspect.md).

## `PgTypeMap`

What `pg`'s default parsers return:

| Postgres | TypeScript |
|---|---|
| `int2`, `int4`, `oid`, `float4`, `float8` | `number` |
| `int8` (also `count(*)`), `numeric`, `money` | `string` |
| `bool` | `boolean` |
| `date`, `timestamp`, `timestamptz` | `Date` |
| `json`, `jsonb` | `unknown` |
| `bytea` | `Buffer` |
| `interval` | `PgInterval` |
| `point`, `circle` | `{ x, y }`, `{ x, y, radius }` |
| text-like and other types | `string` |

Arrays map element-wise. The full table, including the array types `pg` leaves as raw text, is
in the [Adapters guide](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/guide/adapters.md).

Parameters accept the row type and what `pg` serializes for the type (`PgParamTypeMap`):
`number | bigint | string` for `int8`, `numeric` and `money`, `Date | string` for dates and
timestamps, `string` for `interval`, `Uint8Array` for `bytea`.
