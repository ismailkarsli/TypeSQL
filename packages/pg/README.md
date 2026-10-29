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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQUIgNwAoUJFgY4iqCmooAynLi8BQ0ROQpZCsAHN1W8NHiYAChDwX+gsIizq5apDRQfJSKaAAiAEIYGgCQTFIUUgBcScnJwLTZJORUNLQAPCLA4QAsIgB8mrkoIJTAuNk4uBU0AB4w9Y3JtMBSYGyIAPqklCAo2cysHFzdKH0DKcnslGykMR14FaRMs1DAiuu5BkalE9SFZBTG5SIwoPYwM2AwAF4X3I2QKQwLI5PIFYgPEp0CpVGAADguyUoTBgAAtoBN8vsupUaojXjAuNiVmsGhswExOCNUXRbjB5iw2JwUN03kDPj8-ppuBoNMpSEC4JA-ABeODkADucB8eAAFJh+eRFK8IKQTDBTqQnNlghAgU5DFl5PJcBBFNt0UD5JQwGARBYAJSafmChxwMVXYxmLoJOqy4W4J28l3wdiIACCKPRUHdcAcspSAAMTABRAAyKawABUhQA6fKEMC5glcQu5ilUqQ02h0whMXPNVq4DRwVtt9sdztwABiACUAPIAWSFeuBQrgACl+wBJBhwNIZedwftz+v5WNF5FojH5Ftd-edgDqAAkU72U3mt9HMbRYwASACMifwKQA7C+gyGR0CpLHKBLWlDCMo2gBsehQRQURQWUgz5VVBQXGMxX-QC4zkBNkmTdNMxzAs4C2HYYkIT0bmoHsB2HRDfxPM8L0bNp7yfF9khEShaEoMRVk+Lhc2UEARA-MCIKgrNKAAaxQbtgCgIF+ygLNUUECUYM0OCBXgZQmHCX9kIA4B4HjJNUwzbM4CvHd6H0CAtJgWUACoHTgcMTHFcih2-MciAHABVLw4HiABNMyQKgG9nw0B0hMgmgVODeD4EBGBp1vXTUIcYsqAFaIVVIWVKCkRBdjgWUYB6RyRTqHIv0wddeFS-SEB6DDMNnVNexzWcs37ed0hk4r6IIfDtkoXYUEcgA1cM028lMXNlR9CDvAAmRzzyzbzewYWciDgfJwtyEQDWiFBOJ6biUF4oQBI2AAGZjItWYSaFEiSpJkmA5IUpTYuSL9Er-PT4FK5rE1as8OoYLqPN-PKQpvQgSzGuBJum2bioWuBltWlN1s27bdtofawWYljjxQVgIGu5IHvA6KUBeyTpNk+TFIgZSg2SQwYCYKBSA8-NaG5WCUIa+NE1ibCswvPt3MS6jT3PYLt1C9cxUfZ9RFfEQaae6CgyAA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

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
