# @typesql/core

Write Postgres SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

## Install

```sh
npm install @typesql/core
```

Requires TypeScript 7.1 or later.

## Usage

Describe your tables with Postgres type names, then write queries:

```ts
import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";

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

const sql = createSql<DB>();

const query = sql(
  `SELECT u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  7,
);

sql("SELECT emial FROM users");
```

[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbwFAEgYE8wFM4GEIA2ANKgMZRYCGMWAygI7GobZwDiWAdllNVgCYk0mHADkArgQKUARgSxCWOAAqVeIAM4AVEYpFwAShADuO7CQC+cAGZQIIOACIAAko2MA9KWhZHAbiQkYE4aKGtKUhwAEQAhRFRxDR4NAC54lBRgfjSObl4afgAeR2CYABZHAD4AjKwQSmACNPwCYpoADxgqmpR+YA0waXQAfU5KECw0iSlZeTasTu7UFHIqAuHqHK4ePiLHGFAsDRhxsBgALyWUCxrIY9T0zOz2bfyBYtKADiuUSnEYAAW0GGWWahA+IQq1WWBxg8jBrX2Cy60IyMgg-HQU0k0jkWHmi1RNyQFkC3k4xzg7gIcAAvHBVnwGK1YpUABQASgCSHJlPodKpjDZqAABrQAKIAGXFuC0cHEADoskR5Qq6g1iHAwArYfIkHADYajcaAGIGADyAFl5UkoBp5XBpSa5QApc0ASVEWog9y1cHNXu1f0BwKyAsVWX1xujhoA6gAJcUGcWqsP0gAkAEYRUIAOwkLlIJSGEwCoymESFJQQaxwejQ4uqdT2+lN8baSvV2v17m8+DHagtwUEYUoMVSmVy4NAqAgwQMiDiEJsgBUHJV9XabN1WA5cAAgrQ4NIaJSzVbvb62BaAKrKOAxACacGnof4OaQheLtBOMCH5bMfEuypX8NGhHkIApeB1UaAVHEofhKGcBZTnkBVvBAfwIKghkKF2AVqVHEVPQlAw5U9LRzRtZI4DZGCCD3AA1fdJRvcUjzZdMEGpBUwDUcY6PqRoOQsPdky0G8DFET02DgZVcLWAQNhgD8v30XA8IKMsTEAqsRBrBTdnAwjx2lWU4E4CY4HPa1EmSEVCxMkik3I0RKMvP9aJ3JiWLYjisw5HMnHjLApAgRxCyAA) <span data-playground="core"></span>: edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, so treat it as a demo.

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
