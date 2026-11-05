# @typesql/prisma

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against your [Prisma](https://www.prisma.io) schema, and run them through Prisma Client.

## Install

```sh
pnpm add @typesql/core @typesql/prisma
```

Requires `@prisma/client` 7 or later, with the `postgresql`, `sqlite` or `mysql` provider.

## Usage

Add the generator to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` type with the database's own table and column names, native types, defaults and enums. Pass it to `createSql` with your Prisma Client:

```ts
import { createSql } from "@typesql/prisma";
import { postgres } from "@typesql/core/postgres";
import type { DB } from "./db/typesql";

const sql = createSql<DB>(postgres, prisma);

const users = await sql(`SELECT id, display_name FROM users WHERE email = ${sql.param(email)}`).execute();

await sql.transaction(async (tx) => {
  await tx(`DELETE FROM posts WHERE author_id = ${tx.param(1)}`).execute();
});
```

Good to know:

- Rows are typed the way Prisma's raw queries return them: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`.
- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, not the database, so a SQL `INSERT` must set them.
- Without the generator, `createSql(postgres, prisma)` reads the types Prisma Client already generates. They don't record `@map` names or native types, so you may need overrides.

## SQLite

For a SQLite database, pass `sqlite` from `@typesql/core/sqlite` instead: `createSql(sqlite, db)`. The schema is converted to SQLite types; see [SQLite](https://typesql.karsli.net/guide/orms#sqlite).

## MySQL and MariaDB

For the `mysql` provider, with Prisma Client on `@prisma/adapter-mariadb`, pass `mysql` (or `mariadb`) from `@typesql/core/mysql`: `createSql<DB>(mysql, prisma)`. The generator writes MySQL types, and rows are typed the way Prisma's MySQL adapter returns them: `BIGINT` and `INT UNSIGNED` are `bigint`, `DECIMAL` is `Decimal`, `TIME` is a `Date` and `Boolean` columns are numbers. See [MySQL and MariaDB](https://typesql.karsli.net/guide/orms#mysql).

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#prisma) for the generator's options, what it emits and overrides, and [Type mapping](https://typesql.karsli.net/reference/type-mapping#prisma) for the row types.

## License

[MIT](LICENSE)
