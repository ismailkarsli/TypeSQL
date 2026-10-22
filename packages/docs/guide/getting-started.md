# Getting started

TypeSQL infers types from SQL you write as string literals. You describe your database once
as a TypeScript interface; every `sql("…")` call is then parsed by the compiler, which works
out the row type, the parameter types and any mistakes.

To try it first, [open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDeqSS0-vAAjiHUYnCgAMKhXeIA4rD65i3Mgz0AcgCuYbSs2VPaGPQ+OFBwK6AASq5b2gC+oIHOMqAARAAC3aQdwGkklwDcdlX6-kSBtNzaACIAIVA9TsoFAs0YDHQoPB4L4THQIzG3n8TAAPJc+J8ACyXAB8L1Ajg0tHcoCYsB+8zw6Cwgj4hVoIQKRQAktN4IpduAwXDZLQsuh+iFMf4AB54AlvOEU2LQEK0SAAfX0Plg6DmCyWsDFsEl0r54N4sAmTGVLSRo3GaLF1VIeB8ggAXobwUcZTRcHhbCCjaAEVaUWbMdi8AAON1w2izTS1ZWBvqhUO4qPgvCqbLC5OXCVSwn+1hYJiQTXzRU6vUGgvut5Hd5pfT4CQdUAAXiaptaHXRQPxAAoAJRvBxgZCKABi4FAACkAPIc6IJJKabT8AgaNQ4BHafTlxbZIkAEgAjOpl2RVKJxGd0hC5AjKo3m212y2Qv2AAZc8e9aezB8mGoACBSyahoDkDM8Gyf1ZTg8EJ12OcAFkIShMhZlAccp1nBdpi9fAyGgUA53wiCYzjIgExYDsAIRWD4NlAB1AAJblFHvBE31PT9qAAdmHOw7j2Vw332FxDnRO4sECUA2gLRxwQAPQAfiE8Q1m8GQyA7TSNkk6TZPkt5FNAVT3kcABBAhiFgAgJncQxUlCWYZCKNVfCCUJwhcTBvVs300lmT5+wAKkHANL0+cNIgkPAygICFDHMUB9GLWAAFpoH8kgcCfQpmziH03xwDovx-RQ-z0WNjCohFqCCkLwuoGRaHFfsoOyCLLPgUBFX8ZtEJQgjiqGJCAFUMFAQEAE1qso6jP0E4T4EdYqO3EgyuBkuKWhwBSwGUtTR1ANl9BCbFtBMZlZiSegSlGNQyVAI8ii8dUvkclhuC0bhEhYWh7OxZsXC0FJVw4e60OYfKmzUUCWQ7S5aCYWhrn1J1sjkNIZFeOxnzUE0zRKsrPw5LkeVO6ZwDnaH8n7BGIoANUs5BxsUXr+yPepSpCOR3pkBnWqyQcjgi3ZFHAcbdmmDkhgDIDOzNC08CWt5hN6Zo0TEg4uCk7bZKJtEDrhcyTuQ2JHUSdwUhxzJslAXJajIQpih0ZA4oShQJz4cVihkexefKxRf2nfRfFAIbUMhAI1eJMAnaIdA0hCVyikucPYEuCksCSNL4fFS27CDsnOW5acORpkayA6zNYGZ1n2c509B14q4WNgMIsEuYd48dog8nQCjauoyLQGmOdp2mcbkA9qJSTINKKSpGMQjwOwgA) <!-- playground:core -->: edit
the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6;
TypeSQL is built for TypeScript 7.

## Requirements

- TypeScript 7 (the native compiler). The engine is tuned for its speed and limits.
- Node.js 26 or later.
- PostgreSQL. TypeSQL models Postgres semantics only.

## Install

Install the core package and the adapter for your driver:

```sh
pnpm add @typesql/core @typesql/pg pg              # node-postgres
pnpm add @typesql/core @typesql/postgres postgres  # or postgres.js
```

`@typesql/core` has no runtime dependencies. The adapters add a type map that matches the driver's
parsers, and a `createSql<DB>(client)` whose queries run on your client.

If you use Kysely, Drizzle or Prisma, their packages (`@typesql/kysely`, `@typesql/drizzle`,
`@typesql/prisma`) can turn the schema you already have into the one TypeSQL needs. See
[Adapters](../adapters/).

## Describe the schema

Columns are declared with Postgres type names, not TypeScript types. The type map turns them
into TypeScript types at the end, so the same schema works with any driver.

<<< @/snippets/schema.ts#schema

`Col` is `NOT NULL`, `Nullable` allows `NULL`, and `Generated` marks a column with a default,
which makes it optional in `INSERT`. See [Schema and type maps](./schema) for the full list,
[Migrations](./migrations) to derive this interface from your DDL instead, and
[Adapters](../adapters/#orm-schemas) to take it from Kysely, Drizzle or Prisma.

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
//   'SqlError<"column \"emial\" does not exist. Perhaps you meant the column
//    \"email\"?", 1> & "SELECT emial FROM users"'.

sql("SELECT id FROM users WHERE id = $1", "7");
// Argument of type 'string' is not assignable to parameter of type 'number'.
```

The number after the message is the index of the offending token.

## Next steps

- [Queries](./queries): what gets inferred, and how nullability works.
- [Parameters](./parameters): `$1`, `:name` and inline `${sql.param(value)}`.
- [Fragments](./fragments): building statements from pieces.
- [Writing data](./writing-data): `INSERT`, `UPDATE`, `DELETE` and `RETURNING`.
- [Adapters](../adapters/): run queries on your driver, or reuse a Kysely, Drizzle or Prisma schema.
