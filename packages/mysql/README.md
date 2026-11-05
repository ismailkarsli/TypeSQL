# @typesql/mysql

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on MySQL and MariaDB: [mysql2](https://sidorares.github.io/node-mysql2/docs), the [mariadb](https://github.com/mariadb-corporation/mariadb-connector-nodejs) connector, or the serverless drivers of [PlanetScale](https://github.com/planetscale/database-js) and [TiDB Cloud](https://github.com/tidbcloud/serverless-js), with rows typed the way each driver returns them.

## Install

```sh
pnpm add @typesql/core @typesql/mysql mysql2
```

Install the driver you use instead of `mysql2`: `mariadb`, `@planetscale/database` or `@tidbcloud/serverless`.

## Usage

```ts
import { createPool } from "mysql2/promise";
import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";

interface DB {
  posts: {
    id: Col<"int unsigned", { autoIncrement: true }>;
    author_id: Col<"int unsigned">;
    title: Col<"varchar">;
    body: Col<"text", { nullable: true }>;
  };
}

const sql = createSql<DB>(createPool(process.env.DATABASE_URL!));

const posts = await sql(`SELECT id, title FROM posts WHERE author_id = ${sql.param(1)}`).execute();

await sql.transaction(async (tx) => {
  await tx(`UPDATE posts SET title = upper(title) WHERE author_id = ${tx.param(1)}`).execute();
});
```

`createSql` takes a `Pool`, `PoolConnection` or `Connection` from `mysql2/promise`. `$1`, `$2`, … are rewritten to `?` and mysql2 escapes the values into the statement, so every statement works, `LIMIT $1` included. `DECIMAL` comes back as a string and `BIGINT` as a number; pass the type map that matches the pool's options, `BigNumberStringsTypeMap` or `DateStringsTypeMap` from `@typesql/core/mysql`, as the second type argument. On MariaDB, pass `{ dialect: "mariadb" }`, which checks statements against MariaDB's SQL.

`@typesql/mysql/mariadb` does the same for the mariadb connector (`BIGINT` is a `bigint` there, and the dialect defaults to `mariadb`), and `@typesql/mysql/planetscale` and `@typesql/mysql/tidb` for the serverless drivers, which return 64-bit integers, decimals and dates as strings.

## Generate your schema

The `typesql` command of [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) writes the `DB` type from a live database, using this package's introspection:

```sh
pnpm add -D @typesql/cli
pnpm exec typesql introspect --url mysql://root@localhost/app --out src/db/schema.ts
```

## Migrations

`migration("mysql", { up, down })` (or `"mariadb"`) from `@typesql/core/migration` defines a migration with checked DDL, and `createMigrator({ dialect: "mysql", url, … })` runs it through mysql2; see the [migration guide](https://typesql.karsli.net/guide/migrations). Elsewhere, pass `executor(connection)` from this package as `execute`.

## Documentation

- [MySQL and MariaDB](https://typesql.karsli.net/adapters/mysql): running queries, type names, nullability, the differences between the servers, transactions, migrations and limits

## License

[MIT](LICENSE)
