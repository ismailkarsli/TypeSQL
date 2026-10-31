# @typesql/pg

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on [node-postgres](https://node-postgres.com) (`pg` 8.x), with rows typed the way `pg` returns them.

## Install

```sh
npm install @typesql/core @typesql/pg pg
```

## Usage

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./schema";

const sql = createSql<DB>(new Pool());

const users = await sql("SELECT id, email FROM users").execute();

const user = await sql("SELECT id, email FROM users WHERE id = $1", 7).executeTakeFirstOrThrow();

await sql.transaction(async (tx) => {
  const { id } = await tx("INSERT INTO users (email) VALUES ($1) RETURNING id", "a@b.c").executeTakeFirstOrThrow();
  await tx("INSERT INTO posts (author_id, title) VALUES ($1, $2)", id, "Hello").execute();
});
```

`createSql` takes a `Pool`, a `Client` or a `PoolClient`. As in `pg`, `int8` (so `count(*)`), `numeric` and `money` come back as strings.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBDAnmApnA3nAwhANnAXzgDMoIQ4AiAASVQGcBHXAegGNoUXJ6YBzKCnqUA3AChQkWBjhtBAQxgoAys0IkyFGnSHNufURPDR4mAAoQ860uSpgD4iQDslUYvLZoAIgCEMYgEgAV3oUKHoALn8AgOAAEyicXAAeSmAXABZKABoZAAt5ei8UdyDcGCiYKCC0AgA+cRiUEHlgXES8VKUADxhKBsCAuOB6MFx5RAB9J3kQFA6Uyh6+3MwnMvGAI1x5hGragZjN+XGnTwXU9bmoYDZ+xoC5FEUUOMnFC6XQIRhZsBgAF45fKFYqlcqVfaEQ4ERo8GCRaKxBLYTppFwADmBmAKRRK8jKFT2NWhDwJMDy0Em8U+6RgWUOARgwBgO0+y3ugzAQW2Izyr3eRKSXW+vD+gOxcHWuC2bOJB0asLEBDEYg4Tl4cEgVgAvFKUAB3OAWPAACkw6qcKDYzIgTmUVXSfCilHhAiEERYLFwEDYJ0pvBY8jAYEohAAlOJ1ZqmPg9U8XqoUr46qbtbhI6ro-BNogAIJBCnQOB62OmwIAA2UAFEADLVrAAFS1ADp4rkwC3mayUB2W9zefR+W9FLkgi3mq1cGI4LO5-OF4u4AAxABKAHkALJaiC8ehauAAKXXAEkAHJwEJhfdBODri-j+Il1vkylQalxGdL7+LgDqAAlq1XasX0LN8P2fAASABGCtskCAB2eDM2zHc92feQDVaHN8zA6AJ26a1CxQU1MzVO1NSvKAMKwlk4DLSsa3rJs4HbOBjlOTxcgTJQR3gNct0vUJwjgACgJAyc2ig2D4ICSh5DieRqBQbo-h2FsOBAHIxHDAiiKURt5AAaxQZdgHCGB1ygRs8jIA1SMcVCOCCFx9z1TDsPo5hywCKs6wbZtXypNjnJcU0ACpwzgPNlClFcN23eF9wAcQ3ABVMw4B8ABNOAgvfeI4J0vS2GIhyswo+B4RPOIaM82MuygeQNQ8W0nFNQpEDOOBTRgboop1OpolQzAnyIdzaPgPqfN888a1XZtz0bdchOvHrJNwXIOOazwooANTzWs0urWLTRg3JIIAJii4DGzS1cz3PZLWLiIqYkoAQPBQZTVPAdTNO0mIAAZZN0lT9JQQyTLMiyrJsuzyseSq0PgCbPOmwYKzmoDFrPZaUf3Dq8IKuJcm7HZ9sO47TvOuArpu6s7oep6Xre5FZLk-8UBlCBAbBwjSoM4zTPM3g4dsiB7MzAJBBgIIoCcFG2zicQCDIjy6LLCsvH8xsQIExLdwRUTAOAvLiYgvUYLgqgEMofmIfKoA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

## Generate your schema

The `typesql` command of [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) writes the `DB` type from a live database, using this package's introspection:

```sh
npm install -D @typesql/cli
npx typesql introspect --url postgres://localhost/app --out src/db/schema.ts
```

## Documentation

- [node-postgres adapter](https://typesql.karsli.net/adapters/pg): running queries, transactions and migrations
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
