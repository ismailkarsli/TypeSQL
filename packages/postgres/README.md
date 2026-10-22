# @typesql/postgres

[postgres.js](https://github.com/porsager/postgres) (`postgres` 3.x) adapter for
[`@typesql/core`](https://www.npmjs.com/package/@typesql/core): a `createSql` bound to the type
map of postgres.js' default parsers, whose queries run on your `sql` instance and return rows
typed from the SQL.

```sh
pnpm add @typesql/core @typesql/postgres postgres
```

## Usage

```ts
import postgres from "postgres";
import { createSql } from "@typesql/postgres";
import type { DB } from "./schema";

const db = postgres(process.env.DATABASE_URL!);
const sql = createSql<DB>(db); // PostgresJsTypeMap

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();
// { id: string; title: string }[]   int8 is a string by default

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

With bigint parsing enabled on the connection, use `createBigIntSql`:

```ts
import { createBigIntSql } from "@typesql/postgres";

const dbBig = postgres(process.env.DATABASE_URL!, { types: { bigint: postgres.BigInt } });
const big = createBigIntSql<DB>(dbBig); // PostgresJsBigIntTypeMap

const counts = await big("SELECT author_id, count(*) AS n FROM posts GROUP BY author_id").execute();
// { author_id: number; n: bigint }[]
```

## API

| Export | |
|---|---|
| `createSql<DB>(db, options?)` | core's `createSql<DB, PostgresJsTypeMap>()` with the queries running on `db`; `{ rowKeys: "camelCase" }` camelCases the row keys |
| `createBigIntSql<DB>(db, options?)` | the same with `PostgresJsBigIntTypeMap`, for `types: { bigint: postgres.BigInt }` |
| `q.execute()`, `q.executeTakeFirst()`, `q.executeTakeFirstOrThrow()`, `q.executeCount()` | `Promise<Row[]>` (a plain array, result metadata stripped), `Promise<Row \| undefined>`, `Promise<Row>` (`NoResultError` on 0 rows), `Promise<number>` (`.count`, 0 for DDL) |
| `sql.transaction(fn)` | `db.begin(fn)` with `tx` bound to the transaction; `tx.transaction(fn)` is `savepoint(fn)` |
| `executor(db)` | an `Executor` for `q.execute(executor)` and core's `createSql(executor)` (reports `.count`) |
| `migrate(db, m)` | runs `m.statements` (e.g. from core's `migrations()`) in one transaction |
| `PostgresJsSql<DB, Keys>`, `PostgresJsBigIntSql<DB, Keys>` | the types `createSql` and `createBigIntSql` return |
| `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap`, `PostgresJsParamTypeMap` | the type maps (rows), and what parameters also accept |
| `NoResultError`, `PostgresJsQueryable`, `PostgresJsTransactable`, `PostgresJsRows`, `MigrationSource` | errors and parameter types |

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
[postgres.js adapter page](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/adapters/postgres.md).

Parameters accept the row type and what postgres.js serializes for the type
(`PostgresJsParamTypeMap`): `number | bigint | string` for `int8`, `numeric` and `money`,
`Date | string | number` (epoch ms) for dates and timestamps, `string` for `interval`,
`Uint8Array` for `bytea`.
