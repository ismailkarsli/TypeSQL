# @typesql/sqlite

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on SQLite: node:sqlite (`DatabaseSync`), better-sqlite3 or bun:sqlite.

## Install

```sh
pnpm add @typesql/core @typesql/sqlite
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

const posts = await sql(`SELECT id, title FROM posts WHERE author_id = ${sql.param(1)}`).execute();

await sql.transaction(async (tx) => {
  await tx(`UPDATE posts SET title = upper(title) WHERE author_id = ${tx.param(1)}`).execute();
});
```

The statement text is sent as written and `$1`, `$2`, … are bound by name, so result column names match the inferred row type. Pass `{ bigint: true }` to read integers as `bigint`.

## Generate your schema

The `typesql` command of [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) writes the `DB` type from a database file, using this package's introspection:

```sh
pnpm add -D @typesql/cli
pnpm exec typesql introspect --dialect sqlite --db app.db --out src/db/schema.ts
```

## Documentation

- [SQLite](https://typesql.karsli.net/adapters/sqlite): running queries, type names, nullability, transactions, migrations and limits

## License

[MIT](LICENSE)
