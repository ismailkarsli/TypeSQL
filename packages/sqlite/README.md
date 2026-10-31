# @typesql/sqlite

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on SQLite: node:sqlite (`DatabaseSync`), better-sqlite3 or bun:sqlite.

## Install

```sh
npm install @typesql/core @typesql/sqlite
```

## Usage

```ts
import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
  posts: {
    id: Col<"integer", { hasDefault: true }>;
    author_id: Col<"integer">;
    title: Col<"text">;
    body: Col<"text", { nullable: true }>;
  };
}

const sql = createSql<DB>(new DatabaseSync("app.db"));

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

The statement text is sent as written and `$1`, `$2`, … are bound by name, so result column names match the inferred row type. Pass `{ bigint: true }` to read integers as `bigint`.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgEQIY1QI1QZwKYDKAngHYDGcAvnAGZQQhwBEJEAJngFw4COANsBh4mAbgBQoSLDgwiYPIjgBhCHyq16jJgAFZ83nwD0ZaHkMHBw8ZOjwkZKHnSF+6ug2a65eA+f6XRMQkSISgaVDIFZAAhRDEASABXfCgcTjj4+OA2dJU+AB4mYBC8AHM8KCYAGkUAC1xkPHDEvhh0mChEhUoAPnFMvBBUYD5c1UKhAA8YJj6E+LZgHDA+VCIAfRJUEC5lcaYpmZqkEhbVzD5djq6qOcyHJyE2dfQxgqY2ZxhQYWO4epwjWarXanW6d0o-UgOBgaQyWRye3exSE5UqfwBQNQLTaMjBt368WxMFq0HW2TehRRZQqs0J3xgl0pBzw0zp80w7CIzMO1UUpz45yZeJuvX6kLElCCJhIMLgBjgAF44A9nAR+PkYj0ABQkPAAdxQ6CwuEIpDI2qYqDAYAAdGxMEwAJRO8RiGVy6GwpVwVD64bwAzahIAAwIAFEADLhpQAFTgduyNTtDMuNUS9qWKzWm22eAScAAYgAlADyAFkExAYTgE3AAFKlgCSADk4MkKrXEnBS22M9kfXbiaSoOS2AWAOoACXDxfD7dtg2GamVnCXIxDVQSSHXo2YqE+2lZ2xWeFtJhATCoW6di8meDIiSE2td0ogsvgAG0vQBdH1+gN5X4YN4hDVsI2LeNW1jUsqxrOBtWHMkkxkQRLidOAADUAEFIwAVXDAgEIAEgARhqYiACYMLnWM8OLFtWwAcTgFDUzwTcEnIhImCnPBBQgaoxFvVkHyfPAXzdADBCAvhbQ6VBZQib530QnBzQQmBJgwxUegyaT4C0kDQLwgAFZBsNjecvVrCN43Yn1EhtCptXYjDp1neckNHAdlTIzjMm4+IRPvR9n1feIPXgEh-39GSjJDZAo3DKyizLSsbLgDy5zgTk2CIOAmyIls8MjSMQxCsShBURIQkkyVXzEIMw2SuNUMZBQSwrODvWy+dfLgAB+CrxCAA) <span data-playground="sqlite"></span> to hover the types and edit the SQL, with nothing to install.

## Generate your schema

The `typesql` command of [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) writes the `DB` type from a database file, using this package's introspection:

```sh
npm install -D @typesql/cli
npx typesql introspect --dialect sqlite --db app.db --out src/db/schema.ts
```

## Documentation

- [SQLite adapter](https://typesql.karsli.net/adapters/sqlite): running queries, transactions and migrations
- [SQLite](https://typesql.karsli.net/guide/sqlite): type names, nullability, result column names and limits

## License

[MIT](LICENSE)
