---
description: "TypeSQL compared to Prisma TypedSQL: types inferred by the compiler versus .sql files typed by prisma generate against a database."
---

# TypeSQL vs Prisma TypedSQL

[TypedSQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql) is Prisma ORM's way to run typed raw SQL. You put each query in a `.sql` file under `prisma/sql`, and `prisma generate --sql` connects to your database to type it.

## The same query

With TypedSQL, in `prisma/sql/recentPosts.sql`:

```sql
SELECT u.id, u.email, p.title
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.created_at > $1
```

```ts
import { recentPosts } from "./generated/prisma/sql";

const rows = await prisma.$queryRawTyped(recentPosts(new Date("2026-01-01")));
```

With TypeSQL, the SQL stays next to the code that runs it:

```ts
const rows = await sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
).execute();
```

## How they differ

| | Prisma TypedSQL | TypeSQL |
|---|---|---|
| You write | SQL in `.sql` files | SQL strings in TypeScript |
| Types come from | a running database | the TypeScript compiler, reading your schema type |
| Extra step | `prisma generate --sql` after each query change | none |
| Nullability | what the database reports | worked out from the SQL (`LEFT JOIN`, `WHERE x IS NOT NULL`, `COALESCE`) |
| Dynamic queries | each file is one fixed statement | [fragments](../guide/dynamic-sql) |
| Databases | PostgreSQL, MySQL, SQLite and others Prisma supports | PostgreSQL and SQLite; MySQL is planned |

## Choose Prisma TypedSQL when

- You already use Prisma ORM and only need a few raw queries.
- You use MySQL.
- You'd rather check queries against the real database than keep a schema type in sync with it.

## Choose TypeSQL when

- You want types as you type, with no database running and no generate step.
- You want nullability from joins and filters rather than the database's guess.
- Some queries are built from pieces at runtime.

## Using them together

`@typesql/prisma` runs on the same Prisma Client and reads its schema from Prisma, so TypeSQL queries and TypedSQL files can live side by side. See [From Kysely, Drizzle or Prisma](../guide/orms#prisma).
