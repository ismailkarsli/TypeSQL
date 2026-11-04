# @typesql/postgres

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on [postgres.js](https://github.com/porsager/postgres) (`postgres` 3.x or 4.x), with rows typed the way postgres.js returns them.

## Install

```sh
pnpm add @typesql/core @typesql/postgres postgres
```

## Usage

```ts
import postgres from "postgres";
import { createSql } from "@typesql/postgres";
import type { DB } from "./schema";

const sql = createSql<DB>(postgres(process.env.DATABASE_URL!));

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

If your connection parses `int8` to `bigint` (`types: { bigint: postgres.BigInt }`), pass `{ bigint: true }` as the second argument of `createSql`.

## Documentation

- [postgres.js adapter](https://typesql.karsli.net/adapters/postgresql): running queries, transactions and migrations
- [Type mapping](https://typesql.karsli.net/reference/type-mapping#postgres-js): the TypeScript type of every Postgres type

## Prepared statements

```ts
const findPost = sql.prepare("SELECT id, title FROM posts WHERE author_id = $1");
const posts = await findPost(7).execute();
```

Reuse `findPost` with new values. TypeSQL assembles the SQL once and enables postgres.js prepared statements for execution, including queries without parameters. The driver's global `prepare: false` option is respected. All `execute*` methods work. Named parameters and fixed fragments are supported too. Inside a transaction, use `tx.prepare(...)` to bind it to that transaction.

## License

[MIT](LICENSE)
