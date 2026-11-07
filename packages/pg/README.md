# @typesql/pg

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on [node-postgres](https://node-postgres.com) (`pg` 8.x), with rows typed the way `pg` returns them.

## Install

```sh
pnpm add @typesql/core @typesql/pg pg
```

## Usage

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./schema";

const sql = createSql<DB>(new Pool());

const users = await sql("SELECT id, email FROM users").execute();

const user = await sql(`SELECT id, email FROM users WHERE id = ${sql.param(7)}`).executeTakeFirstOrThrow();

await sql.transaction(async (tx) => {
  const { id } = await tx(`INSERT INTO users (email) VALUES (${tx.param("a@b.c")}) RETURNING id`).executeTakeFirstOrThrow();
  await tx(`INSERT INTO posts (author_id, title) VALUES (${tx.param(id)}, ${tx.param("Hello")})`).execute();
});
```

`createSql` takes a `Pool`, a `Client` or a `PoolClient`. As in `pg`, `int8` (so `count(*)`), `numeric` and `money` come back as strings. A client with its own type parsers takes a type map that matches them: `createSql<DB, MyTypeMap>(pool)`.

## Generate your schema

The `typesql` command of [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) writes the `DB` type from a live database, using this package's introspection:

```sh
pnpm add -D @typesql/cli
pnpm exec typesql introspect --url postgres://localhost/app --out src/db/schema.ts
```

## Documentation

- [node-postgres adapter](https://typesql.karsli.net/adapters/postgresql): running queries, transactions and migrations
- [From a live database](https://typesql.karsli.net/guide/introspect): `typesql introspect` options
- [Type mapping](https://typesql.karsli.net/reference/type-mapping#node-postgres): the TypeScript type of every Postgres type

## Prepared statements

```ts
const findUser = sql.prepare("SELECT id, email FROM users WHERE id = $1");
const user = await findUser(7).executeTakeFirst();
```

Reuse `findUser` with new values. TypeSQL assembles the SQL once and node-postgres uses a named statement per connection; the name is derived from the final SQL text. All `execute*` methods work. Named parameters and fixed fragments are supported too. Inside a transaction, use `tx.prepare(...)` to bind it to that transaction.

## License

[MIT](LICENSE)
