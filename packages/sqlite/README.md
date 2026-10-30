# @typesql/sqlite

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on SQLite: node:sqlite (`DatabaseSync`), better-sqlite3 or bun:sqlite.

## Install

```sh
npm install @typesql/core @typesql/sqlite
```

## Usage

```ts
import { DatabaseSync } from "node:sqlite";
import type { Col, Generated, Nullable } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
  posts: {
    id: Generated<"integer">;
    author_id: Col<"integer">;
    title: Col<"text">;
    body: Nullable<"text">;
  };
}

const sql = createSql<DB>(new DatabaseSync("app.db"));

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

The statement text is sent as written and `$1`, `$2`, … are bound by name, so result column names match the inferred row type. Pass `{ bigint: true }` to read integers as `bigint`.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgEQIY1QI1QZwKYDKAngHYDGcAvnAGZQQhwBEJEAJngFw4COANsBh4mAbgBQoSLDgwiYPIjgBhCHwA0cAOJ4SeKOjxsNAOQCufPlj4LqdBswACs+bz4B6MtDxvXg4eMloeCQyKDwDAn4qWnpGJic5PFcffj9RMQkSISgaVDIFZAAhRDEASFN8KBxOEtLS4DYa7V19ITYAHiZgLLwAcz0mAD5xOrwQVGA+GpU+TqEADxghkdK2YBwwSyIAfRJUEC44MwsrPDm8ReWy0tDwtu30Jp09Aw6mNgMYUGFhssoRyA4GDVWr1RpaZ6tQydbpCfpQK51VCmGAAC2g2wa01UMJ68MRpS+MGs2NmTAWS1+dUw7CINWOlkw1nOlyp-zElAynhIQLgrjgAF44LcIvx2kVBgAKXQAdxQ6CwuEIpDIkqYqDAYAAdGxMEwAJT68Ribm8wHAwVwVAyibwVySsoAAwIAFEADIupQAFTg2oaGm1ROsGlMOvWm1QOz2BzKcAAYgAlADyAFlfRAgThfXAAFJJgCSxjgFT0WdMcCTRdDDUt2uRaIxDVjAHUABIuhMu4tasYTPiWzi9yaOtRlJBDqbMVAfBwXfabPBazwgJhUUf6nvzPBkFF4SVGrkQHnwADa5oAupbrba+fwHaVHYXXQmfYWvUn05m4JL6+ioJijBkQRrH1OAADUAEE3QAVRdAhvwAEgARg0BCACZQM7L1oITYxC00OB-SA4k8BHMoULKJhWzwCwICYddN23Xd92Na9BFvPgtRgfQeTyL4jx-HAVW-GB5lAgVBlqNj4FE+8H2ggAFZAIK9LtzSzV0fSDBQhVMTU9ElbTQLbDsu1-Rs2EtZCyLqCjSg3C4mKEFiylNeASCvG12Nkx1kHdF1VPjZM03UuATM7OAaTYIg4HzeDjGgt03UdBytx3IQVFMLIXMoA8xHtZ1-O9YjrCC1NPwtcKuxrIUAH4UvEIA) <span data-playground="sqlite"></span> to hover the types and edit the SQL, with nothing to install.

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
