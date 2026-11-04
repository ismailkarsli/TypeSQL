---
description: "Run TypeSQL queries on postgres.js with @typesql/postgres: create sql, run queries and transactions, type parsing and migrations."
---

# postgres.js

`@typesql/postgres` runs your queries on postgres.js (`postgres` 3.x or 4.x). The two versions parse a few date values differently; see [Type mapping](../reference/type-mapping#dates).

```sh
pnpm add @typesql/core @typesql/postgres postgres
```

## Create `sql`

Pass your postgres.js connection to `createSql`. If the connection parses `int8` to `bigint`, pass `{ bigint: true }`:

```ts
import postgres from "postgres";
import * as pgjs from "@typesql/postgres";

const db = postgres(process.env["DATABASE_URL"]!);
const sqlJs = pgjs.createSql<DB>(db);
const posts = await sqlJs(
	"SELECT id, title FROM posts WHERE author_id = $1",
	1,
).execute();

const dbBig = postgres(process.env["DATABASE_URL"]!, {
	types: { bigint: postgres.BigInt },
});
const big = pgjs.createSql<DB>(dbBig, { bigint: true });
const counts = await big(
	"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id",
).execute();

await sqlJs.transaction(async (tx) => {
	await tx(
		"UPDATE posts SET title = upper(title) WHERE author_id = $1",
		1,
	).execute();
});
```

It takes the `Sql` instance, the `TransactionSql` that `begin` passes, or a `ReservedSql`. Queries run with `unsafe(text, values)`, so the text reaches the server as written.

## Run queries

The `execute*` methods are the same as with [node-postgres](./pg#run-queries). `execute()` returns a plain array, without postgres.js' result metadata (`count`, `command`, `columns`).

Attach `.withPlugin(new CasePlugin())` (imported from `@typesql/core`) for [camelCase row keys](../guide/queries#camelcase-row-keys), and leave postgres.js' own `transform: postgres.camel` off.

## Transactions

`sql.transaction(fn)` is postgres.js' `begin(fn)`, and on a `TransactionSql` it is `savepoint(fn)`. A `ReservedSql` has neither, so there it sends `BEGIN`/`COMMIT` (and `SAVEPOINT` when nested) on the reserved connection. See [Transactions](../guide/transactions).

## Types

Rows are typed with `PostgresJsTypeMap`, which matches postgres.js' default parsers. Numbers, booleans, dates, JSON and `bytea` are parsed; everything else, including `int8` and `numeric`, is the text Postgres sent. Arrays are parsed element by element. The full table is in [Type mapping](../reference/type-mapping#postgres-js).

## Migrations

The [migrator](../guide/migrations#the-migrator) needs one connection for the whole call. With postgres.js, reserve one and pass `executor(reserved)` as `execute`:

```ts
import { createMigrator } from "@typesql/core/migration";
import { executor } from "@typesql/postgres";

const reserved = await db.reserve();
try {
	await createMigrator({
		dialect: "postgres",
		execute: executor(reserved),
		migrations: [createUsers, addBio],
	}).latest();
} finally {
	reserved.release();
}
```

With `url` instead, the migrator connects with `pg`.
