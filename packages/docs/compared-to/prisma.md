---
description: "TypeSQL compared to Prisma ORM: plain SQL typed by the compiler versus a generated client from a Prisma schema."
---

# TypeSQL vs Prisma ORM

[Prisma ORM](https://www.prisma.io/orm) describes your database in a Prisma schema (`schema.prisma`). `prisma generate` turns it into a typed client, and `prisma migrate` creates and applies migrations.

## The same query

With Prisma ORM:

```ts
const users = await prisma.user.findMany({
	where: { createdAt: { gt: new Date("2026-01-01") } },
	select: { id: true, email: true, posts: { select: { title: true } } },
});
```

With TypeSQL:

```ts
const rows = await sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
).execute();
```

Prisma returns nested objects (each user with a `posts` array). TypeSQL returns the rows your SQL produces; nest them with [JSON aggregation](../guide/queries#json) when you want that shape.

## How they differ

| | Prisma ORM | TypeSQL |
|---|---|---|
| You write | a Prisma schema and client calls | a schema type and SQL |
| Types come from | the client `prisma generate` writes | the TypeScript compiler, reading your schema type |
| Extra step | `prisma generate` after each schema change | none |
| Raw SQL | `$queryRaw`, typed by the type you write, or [TypedSQL](./prisma-typedsql) | checked and typed from the SQL |
| Migrations | `prisma migrate` generates them from the schema | you [write the DDL](../guide/migrations), and the schema type follows it |
| Databases | PostgreSQL, MySQL, SQLite, SQL Server, MongoDB, CockroachDB | PostgreSQL and SQLite; MySQL is planned |

## Choose Prisma ORM when

- You want relations, nested reads and nested writes without writing joins.
- You want migrations generated from schema changes.
- You use a database TypeSQL doesn't support yet.

## Choose TypeSQL when

- You'd rather write the SQL itself, including joins, CTEs, window functions and anything else your database supports.
- You want no generate step between changing a query and seeing its types.
- You want queries you can copy into `psql` or a SQL log and run as they are.

## Using them together

`@typesql/prisma` reads your Prisma schema, through the `typesql-prisma` generator or Prisma Client's `Prisma.TypeMap`, and runs queries on Prisma Client or a transaction client. Keep Prisma for the schema, migrations and simple reads, and write the rest as SQL. See [From Kysely, Drizzle or Prisma](../guide/orms#prisma).
