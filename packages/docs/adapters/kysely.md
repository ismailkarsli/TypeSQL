# Kysely

`@typesql/kysely` converts the `DB` interface you give Kysely into a TypeSQL schema and runs
queries on your `Kysely` instance. The conversion happens only at the type level: there is no
code generation and no database connection.

```sh
pnpm add @typesql/core @typesql/kysely kysely
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagNKQDOsANpKABQACWMsRAjqcANbFmQCUAdKAJoB7AK4AnAh3KgAIgCFQGAHZZYogGYBDAMawq7EuQC0WwQBNYAc1iLQIrNGFZbogFAhQODYtOG0o7CqKXApEoLi6RFo4sAC2GgA0oF6moKIaaKBIqKLCiqGCNpAi4oQGFEpEWF46fAASggBuqmHRqQzCpFhEPC4uGDHQgqJOAN6gWqKwGirwzKAAvqBqooIxoABEtPRMLPqc6wDcfQNDoy4AkHRwoADCgqTCMYpQcPEXV7oA4taq07Cmb3OpU4gIACoJKhZJkRpBgNKRYFosG9FstVhs9uRDsdBsNQGNwfcFksVmt1tALNi3GBMZBjGZLNZbI4HMiwv4YjF-i4PqAAJLKAAcoAAvLd7o9nvQADwXSr+RQWQEAIwwFiUTgAPqBFI9lc1tfKlEqLqr1cpQNrdTF9eJDVgFRYXAA+I688D9BhVAai8UPJ4vWDS6R-RIhlSW0BGxVhv6R6MWV08+igACygjMvvWnmg0Eg60j6yIGlMVI1qk0Ohk8hGF2EJFERAAXPiLucMKYW99FL8VKZpdbbUnzudYhoMKQWwmjiOYhnO2n55HdaRSDPzhMpn2APrTLs-NJ96UermVDQDYfzGeDSrN1sjjv7nuH-7SgVYQXD84aRw4Ibbx8dT1VR1ywbAESnB1jXXBxlVIDAiGiBdu17V9lQzBEvEvI55l6Ew8icUxlV9HsMmBchg1kZ1KFrc5TDhBEkRbUjQHBSFoVheFESwGjQEGe5mNgDJCVIShgnmLgUS4I58MqKM5jFTc-lmUhKOoojpN6dxwFaRhhFUChlWECdzHENQhnQTwnGwUBTEEBh0DIUhEiyJYLPCNpKkSKJEVYf4kgsccCJaCJz10Ko4IYHpZMItI1C6X10nHQjlQuHgDG4gAxUlKHJCEunWLg0oypFKAAbXWDt1kSdYwKwBF1gAXSK84eDQaJJly2D4MQ-5qo2EV+s0UgSBanhYAAD0RRxYDEo4XBi0BMNM9CNFEFIxR2SgLgAA3gABRZB9pucBQGEca4gnRJzrnMxvJEZRKGgHgO2CABBeA+Pyog3lAP7-oBwGgeB-60kUVgxNAAB5AA1faACUqCh+HpAR0BZH4cYHp457Xpkfb4Bud7PugUhtFgFwQap4HMvhqHUzOhtQmEUAjsy06ACkob5AA5L7bz46G+een9cH-DtfXOiW3p56Q+J4bqEKQynqdVv6AHVagR-azp4W6NtAAASABGFW1epz46YAVVBdHMal0wdsBbMNFzfM3k0xawb8g2kps5bVFW9bxqmrQZrm6kAYAPQAfi0sABSIDtdA0CQynZLxiyRDACkSVVvCSeTSDCQQFCcLBS5iDAJtAIyTOaZJMhQUA9NUDAopcP2Up4B1M+0MCCjEkPppUSgNCISBFC0KgHQm4IRWde8u-ZCa2x4YRoFMP5wA0SKuu+wq15IHixkV3qFwdfSFha1r2tUWb1lFv9RAA0sasGxJjZv4ew9HzTvzQMlcYkxlLMDUpQWeXBtojh2qjI64Ada03pvzBKmttZJF-OLA2JtQAyzljzKGp0z5ISdm2Y2gJeCTRHrNTSEl5pbT2odY6p0JZIIZvWVQoQ0Hwx1vrX0JsnYbC8FCfM0lQDuFUCsUQzFBBOFTg0eEV9BBqBCqAPh1hHguCAA) <!-- playground:kysely --> to hover the types and edit the SQL, with nothing to install.

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
