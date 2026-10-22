# Drizzle

`@typesql/drizzle` converts your Drizzle schema module into a TypeSQL schema and runs queries on
the driver client under your Drizzle database. The conversion happens only at the type level:
there is no code generation and no database connection.

```sh
pnpm add @typesql/core @typesql/drizzle drizzle-orm
```

Pass your schema module as it is. Tables, views, enums and schemas are converted; relations
and any other exports are ignored:

<<< @/snippets/orm-drizzle-schema.ts#schema

<<< @/snippets/orm-drizzle.ts#query

SQL uses the database names (`display_name`), not the TypeScript keys (`displayName`).

| Drizzle | TypeSQL |
|---|---|
| `pgTable("users", …)` | table `users`, keyed by the SQL name |
| `.notNull()`, `.primaryKey()`, `serial`, identity | `NOT NULL` |
| `.default()`, `.defaultNow()`, `.defaultRandom()`, `serial`, identity, `generatedAlwaysAs()` | has a default |
| `.$defaultFn()`, `.$default()` | **no** default: these run in Drizzle, not in Postgres |
| `pgEnum` exports | `$types`, under the **export name** |
| `pgSchema("auth").table("sessions", …)` | `auth.sessions` |
| `pgView`, `pgMaterializedView` | read-only views |

The Postgres type comes from the column kind (`integer` → `int4`, `doublePrecision` →
`float8`, `uuid` → `uuid`, `.array()` → `[]`, …). Rows are typed by the type map, not by
Drizzle's `mode`: TypeSQL queries go straight to the driver, so a `bigint({ mode: "number" })`
column is `int8`, which node-postgres returns as a `string`.

## Types Drizzle does not record

Drizzle's types do not record `withTimezone`, so `timestamp()` columns are `timestamp` and
`time()` columns are `time`. Pin a column with `pgType`, which returns the builder unchanged
at runtime and also works for `customType` columns:

<<< @/snippets/orm-drizzle-schema.ts#pgtype

Or set the default for all columns. The same options take Drizzle's `casing` setting:

<<< @/snippets/orm-drizzle.ts#options

Enums are typed by finding the exported `pgEnum` with the same values. Name the export after
the SQL type (`export const mood = pgEnum("mood", …)`) so casts like `'happy'::mood` resolve.
If an enum isn't exported, its columns are `text`.

## Running queries

`createSql<typeof schema>(db)` runs the queries on the driver client under `db`: the `Pool`,
`Client` or postgres.js `sql` you passed to `drizzle()`, or inside `db.transaction(fn)` the
transaction's connection. Rows are what the driver returns; Drizzle's column mappers are not
involved. `sql.transaction(fn)` runs in `db.transaction(fn)`. Pass the driver's type map as the
second type argument:

<<< @/snippets/orm-drizzle.ts#run

Only node-postgres and postgres.js databases are supported. `drizzle-orm/postgres-js` turns
off postgres.js' date parsers on the client it is given, so on that driver `date`, `timestamp`,
`timestamptz` and `interval` come back as strings: use a type map that says so. Queries do not
go through Drizzle's logger.

## Limits

- Generated-always columns count as having a default. Postgres rejects an `INSERT` that sets
  one, but TypeSQL doesn't.
- `$onUpdate` columns look like they have a default, so `INSERT` doesn't require them.
- `.$type<T>()` is ignored; rows use the type map (`jsonb().$type<T>()` is `unknown`).
- `text({ enum: [...] })` is plain `text`: in Drizzle, those values are only a TypeScript
  constraint.
