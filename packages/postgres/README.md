# @typesql/postgres

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on [postgres.js](https://github.com/porsager/postgres) (`postgres` 3.x), with rows typed the way postgres.js returns them.

## Install

```sh
npm install @typesql/core @typesql/postgres postgres
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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQU8yFJgBzKCikiA3AChQkWBjiKd1FAGU5cXgKGiJyXXLUQN23QePhoeEk0TDtcB35BYRF1LR09I2NSGig+SkU0ABEAIQxDAEgmKQopAC48-PzgWnKScioaWgAeEWBkgBYRAD4jSpQQSmBccpxcFpoADxhu3vzaYCkwNkQAfVJKEBRy5lYOLnGUKZmC-MsUa1oV6lqyCgvx0F0YDbAYAC9j-O5e2LKKqpqxFuDToLTaMAAHJ98pQmDAABbQFbVEZ4MEdaEwYAwLiosYiSbTHonZ6aP6jA5TADaAF1Pt9DNxDIZaChFGwdBYIKQNHBaOxymEjMoefBZOEALwWKw0MJNHJdAAU-IAlIkRbzfnApZQAO6DMVyRUFAAGNgAogAZc1YAAqcGqhCxOJQTsoZLgADEAEoAeQAsnAtQB1AAS5u95rgABIAIzauAAQQYAE04IrSVIVSb8AUROKRLmVQA6Q5suEoRVq5ms9mUTka+D87LATSCuRNTDsVvg8rdzTghzExtwfsJs7WOUK5XsFuaQhdnvJcowKBMHjVkfKJjJKQJvUG0et435M1Wm322EIpGOrk7mCKgBUKqTNjgpC9fsDWqIfoAqgACnA2RpleiJQMitA5oYJZlooFZVokB7YnA4rFqulA8ukWLcoqlBSIgpCKOmMATC+EpdBUyFBBMJ6noBmSJraUZaha9rOlwCZMGAqBQBm2JcC+YYRlGYE3rQCZxtBlQAOy5vksETOWNCIQUI4fjq+ooaRdEmpk57MZ+AZBl4MB7sJkYWPW8zrLg2KIBm7pZgmAAM0mKcpKA4PeqncNWhjioqZ7WnaDoST6xkhuGlmZnAYiUVJhD5nIIjVkAA) <span data-playground="postgres"></span> to hover the types and edit the SQL, with nothing to install.

## Documentation

- [postgres.js adapter](https://typesql.karsli.net/adapters/postgres): running queries, transactions and migrations
- [Type mapping](https://typesql.karsli.net/reference/type-mapping#postgres-js): the TypeScript type of every Postgres type

## Prepared statements

```ts
const findPost = sql.prepare("SELECT id, title FROM posts WHERE author_id = $1");
const posts = await findPost(7).execute();
```

Reuse `findPost` with new values. TypeSQL assembles the SQL once and enables postgres.js prepared statements for execution, including queries without parameters. The driver's global `prepare: false` option is respected. All `execute*` methods work. Named parameters and fixed fragments are supported too. Inside a transaction, use `tx.prepare(...)` to bind it to that transaction.

## License

[MIT](LICENSE)
