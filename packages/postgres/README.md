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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQUIgNwAoUJFgY4iqCmooAynLi8BQ0ROQpZCyFJgBzQ1PVbw0eJLSYzXAt+QWERJ1d3Ty1SGig+SkU0ABEAIQwNAEgmKQopAC4MzMzgWkKScioaWgAeEWBYgBYRAD5NYpQQSmBcQpxcOpoADxhW9szaYCkwNkQAfVJKEBRC5lYOLkGUEbGszIMjarnqcrIKY1qRGFB7GCWwGAAvXczudoiCopKy4jOqujqDRgAA4XplKEwYAALaBzUp9PCAppg64wLgIgZXbajNp7O4uT79LYjADaAF0Xm8NNwNBpaChFGxDPoIKRnHBaOxCoFNMo2fAHHAALz6QzGQI1NItAAUnIAlJoNHz2R9hXBKAB3boCuTSrIAAxMAFEADJGrAAFTgpUIqK4tsoBLgADEAEoAeQAsnBVQB1AASRtdRrgABIAIxqgCCDAAmnBpfipHL9fgsiIHCI03KAHTbBmQlDShW0+mMyjM5XwTmpYAublyGqYdh1oGFFsuIEWXFVuAdtUHcWNqWy9i1lyEZut2KFGBQJg8Eu95RMWJSNWa7V9ut6zKG03mq0Q6Gwm0s1cwaUAKjlcCjJjgpBdHu9qqIHoAqgAFOCpePHmEoDhWhUw0XN80UQti0VTdgB1XAcznSg2USa5WWlSgpEQUhFATGAhlvIUWiKWDfCGXc92-ZIowtENVWNK07TQEUmDAVAoETOCuFvAMgxDADT1oNUI1A4oAHY00ycChgLGhoKyXsnxFUiEHIvZ9WSA9aOfL0fQgZx1144N9ArSZFlwODEETR1kzVAAGUTpNklAcAveTuBLDQHGlfczUta0hLdXS-UDYykzgMRiJEwgMzkEQSyAA) <span data-playground="postgres"></span> to hover the types and edit the SQL, with nothing to install.

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
