# @typesql/postgres

[postgres.js](https://github.com/porsager/postgres) (`postgres` 3.x) adapter for
[`@typesql/core`](https://www.npmjs.com/package/@typesql/core): a `createSql` bound to the type
map of postgres.js' default parsers, and helpers that run a query and return rows typed from it.

```sh
pnpm add @typesql/core @typesql/postgres postgres
```

## Usage

```ts
import postgres from "postgres";
import { createSql, execute, query, transaction } from "@typesql/postgres";
import type { DB } from "./schema";

const db = postgres(process.env.DATABASE_URL!);
const sql = createSql<DB>(); // PostgresJsTypeMap

const posts = await query(db, sql("SELECT id, title FROM posts WHERE author_id = $1", 1));
// { id: string; title: string }[]   int8 is a string by default

await transaction(db, async (tx) => {
  await execute(tx, sql("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1));
});
```

With bigint parsing enabled on the connection, use `createBigIntSql`:

```ts
import { createBigIntSql, query } from "@typesql/postgres";

const dbBig = postgres(process.env.DATABASE_URL!, { types: { bigint: postgres.BigInt } });
const big = createBigIntSql<DB>(); // PostgresJsBigIntTypeMap

const counts = await query(dbBig, big("SELECT author_id, count(*) AS n FROM posts GROUP BY author_id"));
// { author_id: number; n: bigint }[]
```

## API

| Export | |
|---|---|
| `createSql<DB>()` | core's `createSql<DB, PostgresJsTypeMap>()` |
| `createBigIntSql<DB>()` | core's `createSql<DB, PostgresJsBigIntTypeMap>()`, for `types: { bigint: postgres.BigInt }` |
| `query(db, q)` | `Promise<Row[]>` (a plain array, result metadata stripped) |
| `one(db, q)` | `Promise<Row>`; `RowCountError` unless exactly one row |
| `maybeOne(db, q)` | `Promise<Row \| null>`; `RowCountError` on more than one row |
| `many(db, q)` | `Promise<[Row, ...Row[]]>`; `RowCountError` on zero rows |
| `execute(db, q)` | `Promise<number>`, the affected row count (0 for DDL) |
| `executor(db)` | an `Executor` for `q.execute()` and `q.executeCount()` (reports `.count`); `createSql<DB>(db)` binds one |
| `transaction(db, fn)` | `db.begin(fn)` |
| `migrate(db, m)` | runs `m.statements` (e.g. from core's `migrations()`) in one transaction |
| `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap` | the type maps |
| `RowCountError`, `PostgresJsQueryable`, `PostgresJsTransactable`, `PostgresJsRows`, `MigrationSource` | errors and parameter types |

Queries run with `db.unsafe(text, values)`, so the text reaches the server unchanged and values
are bind parameters. `db` is the `Sql` instance, a `TransactionSql` or a `ReservedSql`.

## Type maps

postgres.js parses only a few types by default; everything else is the text Postgres sent:

| Postgres | `PostgresJsTypeMap` | `PostgresJsBigIntTypeMap` |
|---|---|---|
| `int2`, `int4`, `oid`, `float4`, `float8` | `number` | `number` |
| `int8` (also `count(*)`) | `string` | `bigint` |
| `bool` | `boolean` | `boolean` |
| `date`, `timestamp`, `timestamptz` | `Date` | `Date` |
| `json`, `jsonb` | `unknown` | `unknown` |
| `bytea` | `Buffer` | `Buffer` |
| `numeric`, `interval`, `point`, text-like and other types | `string` | `string` |

Arrays map element-wise. Details in the
[Adapters guide](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/guide/adapters.md).
