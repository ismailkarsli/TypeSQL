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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQU8yFJgBzKCikiA3AChQkWBjiKd1FAGU5cXgKGiJyXXLWaDx8NHiYABQg8B35BYREwLyNjUhooPkpFNAARACEMQwBIJikKKQAuTKys4FoiknIqGloAHhFgOIAWEQA+IxKUEEpgXCKcXHqaAA8YNo6s2mApMDZEAH1SShAUIuZWDi4hlFHx7Kz2SjZSZP68etImFahgRT2SyxRrWnnqCrIKZ6HQXRhlsBgAC97twOuoYIViqVysQPtU6PVGjAABz3LKUJgwAAW0HmZTOgwazTRMGAMC4BO2u3a+zATE40yxdFeMDWLDYnBQ3xWGn+QJBRm4hkMylIGjgkBCAF44OQAO5wIJ4AAUmFF5EUpIgpBsMBupE0RUiEA02l0BXk8lwEEURxxGnklDAYBEDgAlEZReLZLg4DLHtY7IN0q1lZLcB7hV74OxEABBTE4qB+uA+5XZAAGNgAogAZbNYAAqEoAdGVCGAS6TySgKyW6QypEyXtRCEwS10erhDHBe33+wPB3AAGIAJQA8gBZCUmiESuAAKXHAEkGHBcvl13Bx2v22UU5WMdjcWUe0Pz4OAOoACWzo+zpaPSbxtBTABIAIwZ-DZADsP8jaMZw0KQU0oOUehjeNE2gDthhQRRMRQZVIxFbVxQ3ZMZXAyDUzkdMsizPMC2Lcs4EOY5kkIAMahZEcJ2nTDQJvO8H07Xp3y-H8shEShaEoMQdn+LgS2UEARAAuCEKQwtKAAaxQYdgCgDRxygQssUEOUUJiIDlCYOJQOwiCyTw3ACKI-MizgJ8T3oCwIAMmBlQAKjdOA4xsWV6KnYC5yICcAFUAjgNIAE0bJgqAX2-Qw3SkxCaB0qN0PgcFl1fYzcJ9KsqDFJItVIZVKCkRATjgZUYGGdypVaYogMwfdeCy0yqoIwjVxzUdi1XQtx3XPIVIq9iCHIo5KBOFB3IANTjXNAuzLzlU-Qg3wAJnc+9C0C0cGFXIg4DKWKShEbQkhQQThmElBRKECT9gABm4+KdmkmhZIUpSVJgNSNK05KsiA8EwJM+A2v2DNOrvHqGD6vzQOKqKX0IasuBmuaFqWla4HWzbs223b9sO2hjuhbieOvFBWAge6she+DEpQD7FOU1T1M0iBtMjLIdBgJgoFIPyy1oQVUJw0y0wzFJiMLB8x188FmNve9IuPaL9xlT9v1EX8RHpt7kMjIA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

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

Reuse `findUser` with new values. TypeSQL assembles the SQL once and node-postgres caches a named statement per connection; the name is derived from the final SQL text. All `execute*` methods work. Named parameters and fixed fragments are supported too. Inside a transaction, use `tx.prepare(...)` to bind it to that transaction.

## License

[MIT](LICENSE)
