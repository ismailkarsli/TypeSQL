# Kysely

`@typesql/kysely` converts the `DB` interface you give Kysely into a typesql schema and runs
queries on your `Kysely` instance. The conversion happens only at the type level: there is no
code generation and no database connection.

```sh
pnpm add @typesql/core @typesql/kysely kysely
```

Pass the `DB` interface you give to `new Kysely<DB>()`:

<<< @/snippets/orm-kysely.ts#db

<<< @/snippets/orm-kysely.ts#query

Kysely describes a column by its TypeScript type, so the Postgres type is read back from that
type:

| Kysely column type | Postgres type |
|---|---|
| `number` / `string` / `boolean` / `bigint` | `int4` / `text` / `bool` / `int8` |
| `Date`, codegen's `Timestamp` | `timestamptz` |
| codegen's `Int8` / `Numeric` | `int8` / `numeric` |
| `Buffer`, `Uint8Array` | `bytea` |
| `Interval`, `Point`, `Circle` | `interval`, `point`, `circle` |
| `Json`, `JSONColumnType<T>`, other objects | `jsonb` |
| `T[]`, `ArrayType<T>` | element type `[]` |
| a union of string literals (codegen enums) | an enum, registered in `$types` |
| `T \| null` | nullable |
| `Generated<T>`, `GeneratedAlways<T>` | has a default: optional in `INSERT` |
| `"auth.users"` key | `auth.users` |

## Overrides

That mapping is lossy: `number` also stands for `int2`, `float4` and `float8`, `string` also
stands for `uuid`, `varchar` and `time`, and `Timestamp` also stands for `date` and `timestamp`.
Row types are the same either way. Expression types differ: division, aggregates, date
arithmetic. Pin the columns where it matters with the third type argument, keyed by the
interface's table and column keys:

<<< @/snippets/orm-kysely.ts#overrides

To get the exact types without listing overrides, generate the schema from the database
instead ([Introspection](../guide/introspect)) and keep Kysely for the queries it builds.

An override is a type name (`"float8"`) or a partial descriptor
(`{ type?, nullable?, hasDefault? }`). `{ $view: true }` marks a table as a view, so writes
to it are rejected. Without `$types`, each enum column gets its own name (`users.mood`). Two
columns then count as different enums, and `UNION`ing them is an error, just as it would be
for two different Postgres enums.

## camelCase

For an interface generated with `kysely-codegen --camel-case` (used with `CamelCasePlugin`),
pass `{ camelCase: true }`. SQL and rows then use the database's snake_case names:

<<< @/snippets/orm-kysely.ts#camel

For camelCase rows, as `CamelCasePlugin` would return them, pass `{ rowKeys: "camelCase" }`.
The top-level keys are renamed with the plugin's mapping, in the types and at runtime. The
plugin itself stays bypassed, so keys inside JSON values are not renamed. See
[camelCase row keys](../guide/queries#camelcase-row-keys).

<<< @/snippets/orm-kysely.ts#camel-rows

## Running queries

<<< @/snippets/orm-kysely.ts#run

The query is sent as `CompiledQuery.raw(text, values)` through `db.withoutPlugins()`. Logging,
the dialect and the pool still apply, but result transformers such as `CamelCasePlugin` do
not, so rows keep the keys their type says they have. `sql.transaction(fn)` runs in
`db.transaction().execute(...)`, and nests with a savepoint. Kysely's `PostgresDialect` runs on
`pg`. For the exact `pg` types (`Buffer` for `bytea`, interval objects), pass `PgTypeMap` as the
second type argument: `createSql<DB, PgTypeMap>(db)`.

## Limits

- JSON columns always count as nullable, because codegen's `JsonValue` includes `null`.
  Override `{ nullable: false }` to have `INSERT` require them.
- A column only has a default if it is declared `Generated`/`GeneratedAlways`. Mark other
  columns with `{ hasDefault: true }`.
- Views look like tables until you mark them with `$view: true`.
