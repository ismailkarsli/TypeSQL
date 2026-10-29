# @typesql/core

Write SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

## Install

```sh
npm install @typesql/core
```

Requires TypeScript 7.1 or later.

## Usage

Describe your tables with your database's type names, then write queries:

```ts
import { createSql } from "@typesql/core";
import { type Col, type Generated, type Nullable, postgres } from "@typesql/core/postgres";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
  };
}

const sql = createSql<DB>(postgres);

const query = sql(
  `SELECT u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  7,
);

sql("SELECT emial FROM users");
```

[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixE2gJAK4AYQjFjpgOJoAdmnrYAJkWts4AOQCuBAhgARgTsxpCMMADm6IzuIuKSMvJsSgSq6srhUTFa2rr22FCiGMhUACIAQoZGPoxOjABc1UbALk12js5oLgA80sAFACzSAHw6RkZoIBjABE0WBH3YAB4wo+NGLsCMYAFkAPr2DGhNvv5BIUtoq+vGRqiYrvtY7Q5OWN1LoIowDGAwAC9bkYhOMso1mq1Xp0Pr1+gUABzAowYHwwAAW0H2UPMlj6AxgwzGdxgwBgIXmeOkKzWxImgQgLjIpz8AWCaCuNzpoO0QjyansETgqTgAF4UOgPvhFpURgAKLLRRQASh02gFQrwYuFhDlxgABjgAKIAGSNZmYcB8ADpWiQbVMZsQ4GBraTyWhtHBvT7fX6AGLcADyAFkrXUoIwrXAzf7LQApIMASS8LogESjYDgQdTrtRGKxrW1NtaXr95Z9AHUABJG7hGq22lzagAkAEZ9e4jAB2dyq7SmXh8bVDwQchQQURwPDE0y0ehMbXzhgsNg9CdTmdqjXwCJYKPi1J6oyG03my35zFQbFuFAQHwFOUAKmVJGmyzl7pCyrgAEEcHAATYEKgahmmGZwDYwYAKrUHAFQAJpwJehYuJ22j9qYOC-DAB48PwY7rmwk7CjhjDEuqECCvAjqzNq0gYC4GCyNcfwhNaaggLkO4So83TakeBopsa3CWimzBBuG9RwHKtEED+ABqv4mtBRoAXKLYIKk1pgHQDCydMszKkIP71sw0HcF4KY2HAdq8bCzwwOhmGeGYkquCOBFrhu9muBRR6nmaFpwPYIBUKBYa1PU+r9gFwl1mJXgSeBuEyV+aCKcpqnqe2yqdjI1ZoP4EDSP2QA) <span data-playground="core"></span>: edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, so treat it as a demo.

## Run queries

`@typesql/core` types your queries. To run them, add the package for your driver or ORM:

| Package | Runs queries on |
|---|---|
| [`@typesql/pg`](https://www.npmjs.com/package/@typesql/pg) | node-postgres |
| [`@typesql/postgres`](https://www.npmjs.com/package/@typesql/postgres) | postgres.js |
| [`@typesql/kysely`](https://www.npmjs.com/package/@typesql/kysely) | Kysely, with its `DB` interface as the schema |
| [`@typesql/drizzle`](https://www.npmjs.com/package/@typesql/drizzle) | Drizzle, with its schema |
| [`@typesql/prisma`](https://www.npmjs.com/package/@typesql/prisma) | Prisma Client, with its schema |

## Reusable queries

Compile a query once and bind different values with the same inferred types:

```ts
const findUser = sql.prepare("SELECT id, email FROM users WHERE id = $1");
const query = findUser(7);
```

Named parameters and fixed fragments work too. The `pg` and `postgres` adapters also request server-side preparation when these queries execute. See the [prepared query API](https://typesql.karsli.net/reference/api#sql-prepare-text-slots).

## Documentation

The full guide is at **[typesql.karsli.net](https://typesql.karsli.net)**. It covers the [schema](https://typesql.karsli.net/guide/schema), [parameters](https://typesql.karsli.net/guide/parameters), [writing data](https://typesql.karsli.net/guide/writing-data), [dynamic SQL](https://typesql.karsli.net/guide/dynamic-sql), [migrations](https://typesql.karsli.net/guide/migrations), the [type cache](https://typesql.karsli.net/guide/performance) and [known limits](https://typesql.karsli.net/guide/limits).

## License

[MIT](LICENSE)
