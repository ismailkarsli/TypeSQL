---
description: "TypeSQL compared to Drizzle ORM: plain SQL with inferred types versus a TypeScript schema and query builder."
---

# TypeSQL vs Drizzle

[Drizzle](https://orm.drizzle.team) is a TypeScript ORM. You declare tables in TypeScript (`pgTable`, `sqliteTable`), query them with a SQL-like builder or its relational query API, and manage migrations with drizzle-kit.

## The same query

With Drizzle:

```ts
const rows = await db
	.select({ id: users.id, email: users.email, title: posts.title })
	.from(users)
	.leftJoin(posts, eq(posts.authorId, users.id))
	.where(gt(users.createdAt, new Date("2026-01-01")));
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

## How they differ

| | Drizzle | TypeSQL |
|---|---|---|
| You write | a TypeScript schema and builder calls | a schema type and SQL |
| Types come from | your Drizzle schema | your schema type |
| Raw SQL | `` sql<T>`…` ``, typed by the `T` you write | checked and typed from the SQL |
| Relations | the relational query API (`db.query…`) | joins and [JSON aggregation](../guide/queries#json) in SQL |
| Migrations | drizzle-kit generates them from the schema | you [write the DDL](../guide/migrations), and the schema type follows it |
| Databases | PostgreSQL, MySQL, SQLite and more | PostgreSQL and SQLite; MySQL is planned |

## Choose Drizzle when

- You want the schema, relations and migrations defined in one TypeScript file.
- You want migrations generated from schema changes.
- You use MySQL or another database TypeSQL doesn't support yet.

## Choose TypeSQL when

- You'd rather write the SQL itself, including syntax the builder has no method for.
- You want SQL that Drizzle would leave to `` sql<T>`…` `` checked against your schema too.
- You want queries you can copy into `psql` or a SQL log and run as they are.

## Using them together

`@typesql/drizzle` reads your Drizzle schema module and runs queries on the driver client under your Drizzle database. Keep Drizzle for the schema and migrations, and write the queries that are easier in SQL with TypeSQL. See [From Kysely, Drizzle or Prisma](../guide/orms#drizzle).
