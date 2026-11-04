---
description: "TypeSQL compared to Kysely: plain SQL strings versus a type-safe query builder, with the same query in both."
---

# TypeSQL vs Kysely

[Kysely](https://kysely.dev) is a type-safe SQL query builder. You build queries from method calls, and it types them from a `DB` interface that you write or generate with kysely-codegen.

## The same query

With Kysely:

```ts
const rows = await db
	.selectFrom("users as u")
	.leftJoin("posts as p", "p.author_id", "u.id")
	.select(["u.id", "u.email", "p.title"])
	.where("u.created_at", ">", new Date("2026-01-01"))
	.execute();
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

Both give `title` as `string | null`, with no generator and no database connection.

## How they differ

| | Kysely | TypeSQL |
|---|---|---|
| You write | method calls that build SQL | the SQL itself |
| Types come from | your `DB` interface | your schema type |
| Raw SQL | `` sql<T>`…` ``, typed by the `T` you write | checked and typed from the SQL |
| Dynamic queries | conditional method calls | [fragments](../guide/using-sql#dynamic-sql) |
| Databases | PostgreSQL, MySQL, SQLite, SQL Server and community dialects | PostgreSQL and SQLite; MySQL is planned |

## Choose Kysely when

- You'd rather compose queries with method calls.
- You use MySQL or SQL Server.
- Your team prefers TypeScript calls over SQL text.

## Choose TypeSQL when

- You'd rather write plain SQL.
- You need SQL that Kysely has no method for.
- You want queries you can copy into `psql` or a SQL log and run as they are.

## Using them together

`@typesql/kysely` takes the same `DB` interface you pass to `new Kysely<DB>()` and runs queries on your `Kysely` instance or transaction. Keep the builder for queries that change shape at runtime, and write the rest as SQL. See [From Kysely, Drizzle or Prisma](../guide/orms#kysely).
