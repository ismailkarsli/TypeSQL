# @typesql/drizzle

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against your [Drizzle](https://orm.drizzle.team) schema, and run them on your Drizzle database. The schema is converted in the type checker: nothing is generated.

## Install

```sh
npm install @typesql/core @typesql/drizzle drizzle-orm
```

Requires `drizzle-orm` 0.45 or later: on node-postgres or postgres.js for PostgreSQL, or any Drizzle SQLite driver.

## Usage

```ts
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: text().notNull(),
  displayName: text("display_name"),
});

export const posts = pgTable("posts", {
  id: serial().primaryKey(),
  authorId: integer("author_id").notNull().references(() => users.id),
  title: text().notNull(),
});
```

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createSql } from "@typesql/drizzle";
import { postgres } from "@typesql/core/postgres";
import * as schema from "./schema";

const db = drizzle(new Pool(), { schema });
const sql = createSql(postgres, db);

const rows = await sql(
  `SELECT u.email, u.display_name, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  1,
).execute();
```

Good to know:

- SQL uses the database names (`display_name`), not the TypeScript keys (`displayName`).
- `.$defaultFn()` and `.$default()` run in Drizzle, not in Postgres, so a SQL `INSERT` must set those columns.
- Drizzle's types don't record `withTimezone`, so `timestamp()` columns are `timestamp`. Pin a column with `pgType` from this package: `pgType(timestamp("at", { withTimezone: true }), "timestamptz")`.

## SQLite

For a SQLite database, pass `sqlite` from `@typesql/core/sqlite` instead: `createSql(sqlite, db)`. The schema is converted to SQLite types; see [SQLite](https://typesql.karsli.net/guide/orms#sqlite).

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#drizzle) for how the schema is converted, running queries and overrides, and [Limits](https://typesql.karsli.net/guide/limits#orm-schemas) for what the conversion can't tell.

## License

[MIT](LICENSE)
