# Comparison

There are several good ways to get typed database access in TypeScript. This page shows where TypeSQL fits, and when another tool may suit you better.

## At a glance

| Tool | You write | Types come from | Extra step |
|---|---|---|---|
| **TypeSQL** | SQL strings in TypeScript | the TypeScript compiler, reading your schema type | none |
| pgtyped | SQL in `.sql` files or tagged templates | a running database | run its generator |
| Prisma TypedSQL | SQL in `.sql` files | a running database | `prisma generate --sql` |
| SafeQL | SQL in tagged templates | a running database | an ESLint rule |
| Kysely | TypeScript query builder calls | your `DB` interface | none |
| Drizzle | a TypeScript schema and query builder calls | your TypeScript schema | none |
| Prisma ORM | a Prisma schema and client calls | the Prisma schema | `prisma generate` |

## Code generators that ask the database

pgtyped and Prisma TypedSQL send your queries to a running database and generate types from what it returns. SafeQL does the same check from an ESLint rule. Because the database answers, anything it knows (extensions, custom functions, domains) is covered.

TypeSQL needs no database while you write code, and there is no generator to rerun. It also works out nullability from the SQL (a `LEFT JOIN`, a `WHERE x IS NOT NULL`), which the database doesn't report for result columns. It still needs a schema type, which you can [generate once per migration](./introspect).

## Query builders and ORMs

Kysely builds queries from typed method calls, which is handy when a query's shape depends on runtime input. Drizzle and Prisma add a schema, relations and migrations. All three support several databases.

With TypeSQL you write the SQL itself, including syntax a builder has no method for. It is not an ORM: it can [run your migrations](./migrations), but it doesn't track which ones already ran.

## Using them together

You don't have to choose. `@typesql/kysely`, `@typesql/drizzle` and `@typesql/prisma` reuse the schema you already have and run on the same connection. See [From Kysely, Drizzle or Prisma](./orms).

## When another tool fits better

- **You use MySQL or SQLite.** TypeSQL supports only PostgreSQL today. Support for both is planned.
- **You can't use TypeScript 7.1 yet.** TypeSQL runs inside the native compiler and needs 7.1 or later.
- **You prefer building queries in TypeScript** over writing SQL. A query builder is a better match.
- **Most of your SQL is built at runtime.** TypeSQL types SQL it can see at compile time. For text only known at runtime it falls back to `sql.as<Row>()`, where you state the row type yourself.
- **You want an ORM**, with relations and migrations in one place.
