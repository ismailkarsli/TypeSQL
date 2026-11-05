# @typesql/kysely

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against the `DB` interface you already have for [Kysely](https://kysely.dev), and run them on your Kysely instance. The interface can come from [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen), [prisma-kysely](https://github.com/valtyr/prisma-kysely), or be written by hand.

## Install

```sh
pnpm add @typesql/core @typesql/kysely kysely
```

## Usage

```ts
import { createSql } from "@typesql/kysely";
import { postgres } from "@typesql/core/postgres";
import type { DB } from "./db";

const sql = createSql(postgres, db);

const posts = await sql(
  `SELECT u.email, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = ${sql.param(1)}`,
).execute();

await sql.transaction(async (tx) => {
  await tx(`UPDATE posts SET published = true WHERE author_id = ${tx.param(1)}`).execute();
});
```

## Pin column types

Kysely describes columns with TypeScript types, so TypeSQL guesses the Postgres type: `number` is `int4`, `string` is `text`, `Date` is `timestamptz`. Rows come out right either way, but division, aggregates and date arithmetic can differ. Pin the columns where it matters:

```ts
import type { DefaultTypeMap } from "@typesql/core/postgres";

const sql = createSql<DB, DefaultTypeMap, { posts: { score: "float8" } }>(postgres, db);
```

For an interface generated with `kysely-codegen --camel-case`, pass `{ camelCase: true }` as the fourth type argument.

## SQLite

For a SQLite database, pass `sqlite` from `@typesql/core/sqlite` instead: `createSql(sqlite, db)`. The schema is converted to SQLite types; see [SQLite](https://typesql.karsli.net/guide/orms#sqlite).

## MySQL and MariaDB

For a Kysely instance on `MysqlDialect`, pass `mysql` (or `mariadb`) from `@typesql/core/mysql`: `createSql(mysql, db)`. The schema is converted to MySQL types (`number` is `int`, `string` is `varchar`, `Date` is `datetime`) and rows are typed the way mysql2 returns them. Pin a column with an override, as for PostgreSQL. See [MySQL and MariaDB](https://typesql.karsli.net/guide/orms#mysql).

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#kysely) for how columns are converted, overrides, enums and camelCase, and [Limits](https://typesql.karsli.net/guide/limits#orm-schemas) for what the conversion can't tell.

## License

[MIT](LICENSE)
