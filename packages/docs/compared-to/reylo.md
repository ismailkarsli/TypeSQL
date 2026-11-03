# TypeSQL vs Reylo

[Reylo](https://reylo.dev) lets TypeScript import `.sql` files and types them from a live database. Like TypeSQL, it has no generated files and needs TypeScript 7.1: it runs as a content mapper that the compiler calls for each `.sql` import. To type a query, it prepares the statement on your development database (PostgreSQL, MySQL) or reads the database file (SQLite).

## The same query

With Reylo, in `recent_posts.sql`:

```sql
select u.id, u.email, p.title
from users u
left join posts p on p.author_id = u.id
where u.created_at > :since
```

```ts
import recentPosts from "./recent_posts.sql";

const rows = await recentPosts.run(db, { since: new Date("2026-01-01") });
```

With TypeSQL, the SQL stays next to the code that runs it:

```ts
const rows = await sql(
	`select u.id, u.email, p.title
   from users u
   left join posts p on p.author_id = u.id
   where u.created_at > ${sql.param(new Date("2026-01-01"))}`,
).execute();
```

## How they differ

| | Reylo | TypeSQL |
|---|---|---|
| You write | SQL in `.sql` files, imported from TypeScript | SQL strings in TypeScript |
| Types come from | a live development database, through a content mapper | the TypeScript compiler, reading your schema type |
| Type checking needs | a running database, and `tsc --runExternalCode` | `tsc` |
| Running queries | a preload (`--import reylo/register`) or bundler plugin, with the engine installed at runtime | `sql()` builds `{ text, values }`, and your driver sends it |
| Dynamic queries | `CASE` on parameters, and JSON parameters described by a JSON Schema | [fragments](../guide/dynamic-sql) |
| Migrations | applied with your own tool | applied with your own tool, or [written as DDL](../guide/migrations) that the schema type follows |
| Databases | PostgreSQL, MySQL, SQLite, DuckDB (preview) | PostgreSQL and SQLite; MySQL is planned |

Both work out nullability from outer joins and from `WHERE` conditions that reject `NULL`.

## Choose Reylo when

- You use MySQL or DuckDB.
- You want your SQL in `.sql` files.
- You want database errors typed, with `.try()` returning `{ value }` or `{ error }`.
- You'd rather check queries against the real database than keep a schema type in sync with it.

## Choose TypeSQL when

- You want SQL next to the code that runs it, not in a separate file.
- You want to type-check in the editor and CI without a database running.
- You don't want a preload or bundler plugin to run your app, or the engine installed in production.
- Some queries are built from pieces at runtime.
