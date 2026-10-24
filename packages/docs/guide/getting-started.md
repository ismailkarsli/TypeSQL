# Getting started

TypeSQL infers types from SQL you write as string literals. You describe your database once
as a TypeScript interface; every `sql("…")` call is then parsed by the compiler, which works
out the row type, the parameter types and any mistakes. The parser follows Postgres's grammar: it
agrees with Postgres on every checkable statement of Postgres's own regression tests (see
[Postgres compatibility](./postgres-compatibility)).

To try it first, [open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA) <!-- playground:core -->: edit
the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, which
TypeSQL does not support, so treat it as a demo.

## Requirements

- TypeScript 7.1 or later (the native compiler; `7.1.0-beta` works). The engine is tuned for
  its speed and limits. `@typesql/core` declares it as a peer dependency.
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
