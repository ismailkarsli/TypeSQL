# Getting started

typesql infers types from SQL you write as string literals. You describe your database once
as a TypeScript interface; every `sql("…")` call is then parsed by the compiler, which works
out the row type, the parameter types and any mistakes.

## Requirements

- TypeScript 7 (the native compiler). The engine is tuned for its speed and limits.
- Node.js 26 or later.
- PostgreSQL. typesql models Postgres semantics only.

## Install

Install the core package and the adapter for your driver:

```sh
pnpm add typesql @typesql/pg pg              # node-postgres
pnpm add typesql @typesql/postgres postgres  # or postgres.js
```

`typesql` has no runtime dependencies. The adapters add a type map that matches the driver's
parsers and a few helpers to run queries.

If you use Kysely, Drizzle or Prisma, their packages (`@typesql/kysely`, `@typesql/drizzle`,
`@typesql/prisma`) can turn the schema you already have into the one typesql needs. See
[ORM schemas](./orm-schemas).

## Describe the schema

Columns are declared with Postgres type names, not TypeScript types. The type map turns them
into TypeScript types at the end, so the same schema works with any driver.

<<< @/snippets/schema.ts#schema

`Col` is `NOT NULL`, `Nullable` allows `NULL`, and `Generated` marks a column with a default,
which makes it optional in `INSERT`. See [Schema and type maps](./schema) for the full list,
[Migrations](./migrations) to derive this interface from your DDL instead, and
[ORM schemas](./orm-schemas) to take it from Kysely, Drizzle or Prisma.

## Write a query

<<< @/snippets/getting-started.ts#query

The `LEFT JOIN` makes `title` nullable, and `$1` takes the type of `created_at`. The query object
is plain data; the text is sent to Postgres unchanged:

<<< @/snippets/getting-started.ts#text

## Mistakes are compile errors

When the SQL is wrong, the error appears on the string, worded like the Postgres error you
would get at runtime:

```ts
sql("SELECT emial FROM users");
// Argument of type '"SELECT emial FROM users"' is not assignable to parameter of type
//   '"SELECT emial FROM users" & SqlError<"column \"emial\" does not exist.
//    Perhaps you meant the column \"email\"?", 1>'.

sql("SELECT id FROM users WHERE id = $1", "7");
// Argument of type 'string' is not assignable to parameter of type 'number'.
```

The number after the message is the index of the offending token.

## Next steps

- [Queries](./queries): what gets inferred, and how nullability works.
- [Parameters](./parameters): `$1`, `:name` and inline `${sql.param(value)}`.
- [Fragments](./fragments): building statements from pieces.
- [Writing data](./writing-data): `INSERT`, `UPDATE`, `DELETE` and `RETURNING`.
- [ORM schemas](./orm-schemas): reuse a Kysely, Drizzle or Prisma schema.
