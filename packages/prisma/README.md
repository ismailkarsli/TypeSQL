# @typesql/prisma

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against your [Prisma](https://www.prisma.io) schema, and run them through Prisma Client.

## Install

```sh
npm install @typesql/core @typesql/prisma
```

Requires `@prisma/client` 7 or later, with the `postgresql` or `sqlite` provider.

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

const users = await sql("SELECT id, display_name FROM users WHERE email = $1", email).execute();

await sql.transaction(async (tx) => {
  await tx("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzjAnmApnAwhANgGjkgGcYBzKdYuAXzgDMoIQ4AiAAVQ2IEdcB6AMbR0-EuUrFWAbgBQoSLERxBlAIYx0AZT6EumAApRgxEGoBKagO5ZcwdADt4dRszac0VPmOOm1M2XkndCh6NUFMABEAIURZAEgAV2IQ4gAuOPj44AATDJxcAB5WYCcAFlZCJAALNWJI9DDE3BgMmChEzBoAPjks9DNgXHy8YoA3NShBWqhWXoT4nJMwXDUUAH0HNRB0EaLWTQAPGErlB2bVgCNcXeQOrvmsphu94vM8dFOauoamlrb7rRHkkwDkNOgcgBBVrYUYHUBUGDbMBzPo0PridKZbJ5WH7RKJXKohZqRIwarQda5V4lcrErIwYAwF544pHE7Asb2KxYgrFUowAAcXzgtXqjVJ-zunSBaL6ABJ9FiEAt3izWJDIgBZACSADlWHAAD5sACqWgAouYAvF0bIaIEcuhBKtKCoIA5SERfGYMkYTGZLDY7I4YHJhJ74LxcHAALwqdSaHRFGLdAAU4goVEIYB9agAlHJZBGvWociBStR49Y1Ey4NG0wkAAaWgAyFqwABU4LlCEtiCs1pttuhCKxEqDwVCTnAAGLmADyWrgyVScAA6gAJK0WuDPTDx+UARib+ASGu1+sqsnzADp0IdnWT0GnC4ES1GkTAq3Aa3WG82bYdt2pLkpSvbuokThpgAVPmcCQloRAQKQxCEMQiQgGmXLoDy8GIXAOE8nOi7LpicAAOKLqaBhwNEACav5khSUBUjkp43vej6CM+r5Fh+cBOjcmg5HGv5WLWUZ8Le7RqJ64SMh6aZpjAhzwbG3QJKpaZNpEFrtp2u7zkuyGoRu27mLuoEsWxYnHqecBHneD5PpoOBQTAr5nm+sgNk2+qWuY3b6p2C6md+cBptZ4E5HoTI3PBABqkKtqaFpIWmx6EPKABM+YOUeY6buguC4BArBvkAA) <span data-playground="prisma"></span> to hover the types and edit the SQL, with nothing to install.

Good to know:

- Rows are typed the way Prisma's raw queries return them: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`.
- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, not the database, so a SQL `INSERT` must set them.
- Without the generator, `createSql(postgres, prisma)` reads the types Prisma Client already generates. They don't record `@map` names or native types, so you may need overrides.

## SQLite

For a SQLite database, pass `sqlite` from `@typesql/core/sqlite` instead: `createSql(sqlite, db)`. The schema is converted to SQLite types; see [SQLite](https://typesql.karsli.net/guide/orms#sqlite).

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#prisma) for the generator's options, what it emits and overrides, and [Type mapping](https://typesql.karsli.net/reference/type-mapping#prisma) for the row types.

## License

[MIT](LICENSE)
