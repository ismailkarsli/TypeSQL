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
// { id: number; email: string }[]

const user = await sql("SELECT id, email FROM users WHERE id = $1", 7).executeTakeFirstOrThrow();

await sql.transaction(async (tx) => {
  const { id } = await tx("INSERT INTO users (email) VALUES ($1) RETURNING id", "a@b.c").executeTakeFirstOrThrow();
  await tx("INSERT INTO posts (author_id, title) VALUES ($1, $2)", id, "Hello").execute();
});
```

`createSql` takes a `Pool`, a `Client` or a `PoolClient`. As in `pg`, `int8` (so `count(*)`), `numeric` and `money` come back as strings.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagHYD2AJrALTSEDOWA5gE6xWgAUAAljEwI4A2w0WgEoAdKEQBXWPQxNQ9CflCElkQhPqgACoUK8ANKACG+YvMJpmRxqE5wzAI0jocRrACgQoQQHJmpADMjCV4sb2sqaWZGLA18AC5QDHwsAA5jUwIJAFtpDABjY2YaGXxaKkMsDFyaI2zoK2YAETdYMQAJQgA3aVscWHkmEKwqEXd3asp6MLsBgG9QAGE9QwBxWHxpVuJDADkQ3iMHXgGAX1AA+kJs0AAiDi4qPmB8wkZbgG4J+rewhfzGK14HxQOdLtc7g84E9+IJPt8pn9tLpeKCLlcbrc4V9PGAAOoyLADXAYZhOUCuUyGN6gWgbLZEpJhcE3NQaUDENxHIyRRIAA1mMKSKSuVDg+TCZDIGlRgDICUBS9RhKj5frZIwiEZ8iYpaRBfIDJoAIVAc3cAEgJJF6FREmbzeaMMREutNvRtgAeW7JLAAFluAD4vg7YOqMLxEsteF6iQAPLCB4Pm4ik6CHSAAfXwdVgiX2vEOx1gMdg8cTFvNDiMh3wBsjei9+ByeXy5YdANg2wzbhd9PdROIMeqTCwdWgWAAXm3TsHKDRbaaK07e27Pd6Uqk2+bgrg3hnl0sG+u-VuqlgTvXo7c4wmgxXoBJjqT+sRu1g8wcjichzVR-VJ9OXynOMrz4DQ3goqAAC8BCwGgyJ6Cw-wqJsEoYCo8BYKUtCJFi1B0IwtogLwhD5NWOD4cARjQNAtygkIXygeBQowR2QJ8B6xoBiwlB6AxIEqOBTgAIISLumgwTCLAWny8AAKLIHJizgN4IhOoY0CatgJwaSID5PlQL5voYEgiKGRjhu4oDWTZtl2fZoAAGIAEoAPIALIQfO3igAAUq5ACSuygFaUQhaArnBaZTrQapO4UfQ+7EFZDmpfZeLtHJzlyXFYkJUlsUACQAIx8voFoAOzlfxTFhHOIyxUYaAWWEIl5W8ZmxrA+RibALD8V4NkAHoAPwCWBYShRJxjNdgoBSTJ8mKcpSQ7KAVY1gahhsQOb5OW5nlTcwGVZTl5nhkVpXleatxGJybClmOJwiK82S3NVnXdb14BGAA1rAjkYDaWCufQ4A4FcaD9V8g3WaN43ga8igNTBTUtfNfDSeaskKUpKnxXu6mgEjKQsAAVEIoDCfABD7R5XkNasbkAKpaKARoAJrGO1iVOmV7iiKWX1EtDuK2fDYtYLGSTFCCDjqJkWCEMomy2O6YFGGhKiRh57kBSpaD9EouADAEiha0ohF6D0FSgG5yDIEawmLAA0i4GxMn0kOjO4tUMwFZio7Nyp8Jq6tUJrVQqCwPKQLWrBS5TUEBou5qDfD5p+wsMXnEH6NS1j2NBfJzkqUF4CuSF1rMCw50GOt1YmAalMAGrCcgzNyTTLAlYYhUAEyU9l4DM85uxBasq38w6twMJrsAPbGT1tK970VgADNdgtdT1RI-f9gPA6D4OQ6LmeCXV+GNcHtixoXfLF1lZe7BXDM1wTvNrWeJyt+3nfd73UAA8h5yRHmPCeU9rqOh2BWW47RYAFkIGvc029hawH3gDIGNBj4QwsGfGIcQGZqWIEBfiYstDWBzESG0xgbCqm6v9MwRhaAWQmn0WAQNiZ6ByAkbm4kCqkmFH6MYaM5pST5E0XG4AcouXpvVY6mVsp8PyjFGCJUyp3AqrcVBu8+oMVAF4aQVx6CJCMPNLCyRaAywIIQMIJghG+ncEAA) <!-- playground:pg --> to hover the types and edit the SQL, with nothing to install.

## Generate your schema

This package also ships the `typesql` command, which writes the `DB` type from a live database:

```sh
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
