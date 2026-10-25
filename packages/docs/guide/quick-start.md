# Quick start

This page takes you from an empty project to a typed query in a few minutes.

::: tip Try it first
[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA) <!-- playground:core --> to edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, which TypeSQL does not support, so treat it as a demo.
:::

## 1. Install

This page uses node-postgres. [Installation](./installation) covers postgres.js, other package managers and the requirements.

```sh
npm install @typesql/core @typesql/pg pg
npm install -D typescript@7.1.0-beta
```

## 2. Describe your tables

A schema is a TypeScript interface. Each key is a table, and each column has a Postgres type name.

<<< @/snippets/quick-start.ts#schema

- `Col` is a `NOT NULL` column.
- `Nullable` allows `NULL`.
- `Generated` has a default (`serial`, identity, `DEFAULT …`), so `INSERT` can leave it out.

You can also generate it [from a live database](./introspect), derive it [from your migrations](./migrations), or take it [from Kysely, Drizzle or Prisma](./orms). [Declaring tables](./schema) lists every column helper.

## 3. Create `sql`

Pass the schema and your driver's client to `createSql`:

<<< @/snippets/quick-start.ts#create

## 4. Write a query

<<< @/snippets/quick-start.ts#query

The `LEFT JOIN` makes `title` nullable, because a user may have no posts. `$1` takes the type of `created_at`, so it accepts a `Date`.

## 5. Run it

<<< @/snippets/quick-start.ts#run

`executeTakeFirstOrThrow()` throws a `NoResultError` when there is no row. [node-postgres](../adapters/pg) lists all the `execute*` methods.

The text goes to Postgres as you wrote it, and the values go as parameters:

<<< @/snippets/quick-start.ts#text

## 6. Mistakes are compile errors

When the SQL is wrong, the error appears on the string, worded like the Postgres error:

```ts
sql("SELECT emial FROM users");
// Argument of type '"SELECT emial FROM users"' is not assignable to parameter of type
//   'SqlError<"column \"emial\" does not exist. Perhaps you meant the column \"email\"?", 1> & "SELECT emial FROM users"'.

sql("SELECT id FROM users WHERE id = $1", "7");
// Argument of type 'string' is not assignable to parameter of type 'number'.
```

The number after the message is the position of the wrong token. [Errors and troubleshooting](./errors) explains how to read these.

## Next steps

- [Selecting data](./queries): joins, nullability, aggregates and JSON.
- [Parameters](./parameters): `$1`, `:name` and inline `${sql.param(value)}`.
- [Inserting and updating](./writing-data): `INSERT`, `UPDATE`, `DELETE` and `RETURNING`.
- [Dynamic SQL](./dynamic-sql): build statements from pieces.
- Editor support for [VS Code](./vscode), [Zed](./zed) and [Neovim](./neovim): completions and highlighting inside your SQL strings.
