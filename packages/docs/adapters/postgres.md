# postgres.js

`@typesql/postgres` runs your queries on postgres.js (`postgres` 3.x).

```sh
npm install @typesql/core @typesql/postgres postgres
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQU8yFJgBzKCikiA3AChQkWBjiKd1FAGU5cXgKGiJyXXLUQN23QePhoeEk0TDtcB35BYRF1LR09I2NSGig+SkU0ABEAIQxDAEgmKQopAC48-PzgWnKScioaWgAeEWBkgBYRAD4jSpQQSmBccpxcFpoADxhu3vzaYCkwNkQAfVJKEBRy5lYOLnGUKZmC-MsUa1oV6lqyCgvx0F0YDbAYAC9j-O5e2LKKqpqxFuDToLTaMAAHJ98pQmDAABbQFbVEZ4MEdaEwYAwLiosYiSbTHonZ6aP6jA5TADaAF1Pt9DNxDIZaChFGwdBYIKQNHBaOxymEjMoefBZOEALwWKw0MJNHJdAAU-IAlIkRbzfnApZQAO6DMVyRUFAAGNgAogAZc1YAAqcGqhCxOJQTsoZLgADEAEoAeQAsnAtQB1AAS5u95rgABIAIzauAAQQYAE04IrSVIVSb8AUROKRLmVQA6Q5suEoRVq5ms9mUTka+D87LATSCuRNTDsVvg8rdzTghzExtwfsJs7WOUK5XsFuaQhdnvJcowKBMHjVkfKJjJKQJvUG0et435M1Wm322EIpGOrk7mCKgBUKqTNjgpC9fsDWqIfoAqgACnA2RpleiJQMitA5oYJZlooFZVokB7YnA4rFqulA8ukWLcoqlBSIgpCKOmMATC+EpdBUyFBBMJ6noBmSJraUZaha9rOlwCZMGAqBQBm2JcC+YYRlGYE3rQCZxtBlQAOy5vksETOWNCIQUI4fjq+ooaRdEmpk57MZ+AZBl4MB7sJkYWPW8zrLg2KIBm7pZgmAAM0mKcpKA4PeqncNWhjioqZ7WnaDoST6xkhuGlmZnAYiUVJhD5nIIjVkAA) <span data-playground="postgres"></span> to hover the types and edit the SQL, with nothing to install.

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

`sql.transaction(fn)` is postgres.js' `begin(fn)`, and on a `TransactionSql` it is `savepoint(fn)`. See [Transactions](../guide/transactions).

## Types

Rows are typed with `PostgresJsTypeMap`, which matches postgres.js' default parsers. Numbers, booleans, dates, JSON and `bytea` are parsed; everything else, including `int8` and `numeric`, is the text Postgres sent. Arrays are parsed element by element. The full table is in [Type mapping](../reference/type-mapping#postgres-js).

## Migrations

`migrate(db, m)` runs a [`migrations()`](../guide/migrations) builder's statements in one transaction. See [From migrations](../guide/migrations#running-migrations).
