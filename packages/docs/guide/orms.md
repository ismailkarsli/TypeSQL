# From Kysely, Drizzle or Prisma

If Kysely, Drizzle or Prisma already describes your database, you don't need to write the schema again. TypeSQL's package for your ORM turns its types into the schema `createSql` needs, so you can write SQL next to your ORM code, checked against the same tables.

| Package | Schema from | Runs queries on |
|---|---|---|
| [`@typesql/kysely`](#kysely) | your Kysely `DB` interface (kysely-codegen, prisma-kysely or hand-written) | a `Kysely` instance or transaction |
| [`@typesql/drizzle`](#drizzle) | your Drizzle schema module (`pgTable`, `pgView`, `pgEnum`, `pgSchema`) | the driver client under your Drizzle database |
| [`@typesql/prisma`](#prisma) | the `typesql-prisma` generator, or Prisma Client's `Prisma.TypeMap` | Prisma Client or a transaction client |

An ORM's types say less than the database does, so each conversion has a few gaps, which you can fill with overrides.

::: tip
For the exact Postgres types without overrides, [generate the schema from the database](./introspect) instead, and keep the ORM for the queries it builds.
:::

## Kysely

```sh
npm install @typesql/core @typesql/kysely kysely
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagNKQDOsANpKABQACWMsRAjqcANbFmQCUAdKAJoB7AK4AnAh3KgAIgCFQGAHZZYogGYBDAMawq7EuQC0WwQBNYAc1iLQIrNGFZbogFAhQODYtOG0o7CqKXApEoLi6RFo4sAC2GgA0oF6moKIaaKBIqKLCiqGCNpAi4oQGFEpEWF46fAASggBuqmHRqQzCpFhEPC4uGDHQgqJOAN6gWqKwGirwzKAAvqBqooIxoABEtPRMLPqc6wDcfQNDoy4AkHRwoADCgqTCMYpQcPEXV7oA4taq07Cmb3OpU4gIACoJKhZJkRpBgNKRYFosG9FstVhs9uRDsdBsNQGNwfcFksVmt1tALNi3GBMZBjGZLNZbI4HMiwv4YjF-i4PqAAJLKAAcoAAvLd7o9nvQADwXSr+RQWQEAIwwFiUTgAPqBFI9lc1tfKlEqLqr1cpQNrdTF9eJDVgFRYXAA+I688D9BhVAai8UPJ4vWDS6R-RIhlSW0BGxVhv6R6MWV08+igACygjMvvWnmg0Eg60j6yIGlMVI1qk0Ohk8hGF2EJFERAAXPiLucMKYW99FL8VKZpdbbUnzudYhoMKQWwmjiOYhnO2n55HdaRSDPzhMpn2APrTLs-NJ96UermVDQDYfzGeDSrN1sjjv7nuH-7SgVYQXD84aRw4Ibbx8dT1VR1ywbAESnB1jXXBxlVIDAiGiBdu17V9lQzBEvEvI55l6Ew8icUxlV9HsMmBchg1kZ1KFrc5TDhBEkRbUjQHBSFoVheFESwGjQEGe5mNgDJCVIShgnmLgUS4I58MqKM5jFTc-lmUhKOoojpN6dxwFaRhhFUChlWECdzHENQhnQTwnGwUBTEEBh0DIUhEiyJYLPCNpKkSKJEVYf4kgsccCJaCJz10Ko4IYHpZMItI1C6X10nHQjlQuHgDG4gAxUlKHJCEunWLg0oypFKAAbXWDt1kSdYwKwBF1gAXSK84eDQaJJly2D4MQ-5qo2EV+s0UgSBanhYAAD0RRxYDEo4XBi0BMNM9CNFEFIxR2SgLgAA3gABRZB9pucBQGEca4gnRJzrnMxvJEZRKGgHgO2CABBeA+Pyog3lAP7-oBwGgeB-60kUVgxNAAB5AA1faACUqCh+HpAR0BZH4cYHp457Xpkfb4Bud7PugUhtFgFwQap4HMvhqHUzOhtQmEUAjsy06ACkob5AA5L7bz46G+een9cH-DtfXOiW3p56Q+J4bqEKQynqdVv6AHVagR-azp4W6NtAAASABGFW1epz46YAVVBdHMal0wdsBbMNFzfM3k0xawb8g2kps5bVFW9bxqmrQZrm6kAYAPQAfi0sABSIDtdA0CQynZLxiyRDACkSVVvCSeTSDCQQFCcLBS5iDAJtAIyTOaZJMhQUA9NUDAopcP2Up4B1M+0MCCjEkPppUSgNCISBFC0KgHQm4IRWde8u-ZCa2x4YRoFMP5wA0SKuu+wq15IHixkV3qFwdfSFha1r2tUWb1lFv9RAA0sasGxJjZv4ew9HzTvzQMlcYkxlLMDUpQWeXBtojh2qjI64Ada03pvzBKmttZJF-OLA2JtQAyzljzKGp0z5ISdm2Y2gJeCTRHrNTSEl5pbT2odY6p0JZIIZvWVQoQ0Hwx1vrX0JsnYbC8FCfM0lQDuFUCsUQzFBBOFTg0eEV9BBqBCqAPh1hHguCAA) <!-- playground:kysely -->.

Pass the same `DB` interface you give to `new Kysely<DB>()`. The conversion happens in the type checker: no code generation, no database connection.

<<< @/snippets/orm-kysely.ts#db

<<< @/snippets/orm-kysely.ts#query

Kysely describes columns with TypeScript types, so TypeSQL reads the Postgres type back from them:

| Kysely column type | Postgres type |
|---|---|
| `number` / `string` / `boolean` / `bigint` | `int4` / `text` / `bool` / `int8` |
| `Date`, codegen's `Timestamp` | `timestamptz` |
| codegen's `Int8` / `Numeric` | `int8` / `numeric` |
| `Buffer`, `Uint8Array` | `bytea` |
| `Interval`, `Point`, `Circle` | `interval`, `point`, `circle` |
| `Json`, `JSONColumnType<T>`, other objects | `jsonb` (always nullable, because codegen's `JsonValue` includes `null`) |
| `T[]`, `ArrayType<T>` | element type `[]` |
| a union of string literals (codegen enums) | an enum, registered in `$types` |
| `T \| null` | nullable |
| `Generated<T>`, `GeneratedAlways<T>` | has a default: optional in `INSERT` (no other column has one) |
| `"auth.users"` key | `auth.users` |

### Running queries

<<< @/snippets/orm-kysely.ts#run

Queries run through `db.withoutPlugins()`, so logging, the dialect and the pool apply, but result transformers such as `CamelCasePlugin` don't. Kysely's `PostgresDialect` runs on `pg`: for the exact `pg` types (`Buffer` for `bytea`, interval objects), use `createSql<DB, PgTypeMap>(db)`.

### Overrides

`number` also stands for `int2`, `float4` and `float8`, `string` for `uuid`, `varchar` and `time`, and `Timestamp` for `date` and `timestamp`. Rows come out the same, but expressions such as division, aggregates and date arithmetic can differ. Pin the columns where it matters with the third type argument:

<<< @/snippets/orm-kysely.ts#overrides

- An override is a type name (`"float8"`) or a partial descriptor: `{ type?, nullable?, hasDefault? }`. Use `{ nullable: false }` for a JSON column `INSERT` must set, and `{ hasDefault: true }` for a column with a database default that isn't `Generated`.
- `{ $view: true }` marks a table as a view, so writes to it are rejected.
- Without `$types`, each enum column gets its own name (`users.mood`), so a `UNION` of two such columns is an error.

### camelCase

For an interface generated with `kysely-codegen --camel-case`, pass `{ camelCase: true }`. SQL and rows then use the database's snake_case names:

<<< @/snippets/orm-kysely.ts#camel

For camelCase rows, as `CamelCasePlugin` would return them, also pass `{ rowKeys: "camelCase" }`. Only top-level keys are renamed, not keys inside JSON values. See [camelCase row keys](./queries#camelcase-row-keys).

<<< @/snippets/orm-kysely.ts#camel-rows

## Drizzle

```sh
npm install @typesql/core @typesql/drizzle drizzle-orm
```

Pass your schema module as it is. Tables, views, enums and schemas are converted in the type checker; relations and other exports are ignored. SQL uses the database names (`display_name`), not the TypeScript keys (`displayName`).

<<< @/snippets/orm-drizzle-schema.ts#schema

<<< @/snippets/orm-drizzle.ts#query

| Drizzle | TypeSQL |
|---|---|
| `pgTable("users", …)` | table `users`, keyed by the SQL name |
| `.notNull()`, `.primaryKey()`, `serial`, identity | `NOT NULL` |
| `.default()`, `.defaultNow()`, `.defaultRandom()`, `serial`, identity, `generatedAlwaysAs()` | has a default |
| `.$defaultFn()`, `.$default()` | **no** default: these run in Drizzle, not in Postgres |
| `pgEnum` exports | `$types`, under the **export name** |
| `pgSchema("auth").table("sessions", …)` | `auth.sessions` |
| `pgView`, `pgMaterializedView` | read-only views |

The Postgres type comes from the column kind: `integer` is `int4`, `doublePrecision` is `float8`, `.array()` adds `[]`, and so on. Rows are typed by the driver's type map, not by Drizzle's `mode`: a `bigint({ mode: "number" })` column is `int8`, which node-postgres returns as a `string`.

### Running queries

`createSql<typeof schema>(db)` runs queries on the driver client under `db`: the `Pool`, `Client` or postgres.js `sql` you passed to `drizzle()`, or the transaction's connection inside `db.transaction(fn)`. Pass the driver's type map as the second type argument:

<<< @/snippets/orm-drizzle.ts#run

Rows are what the driver returns: Drizzle's column mappers and logger are not involved. Only node-postgres and postgres.js databases are supported.

::: warning postgres.js dates
`drizzle-orm/postgres-js` turns off postgres.js' date parsers on its client. On that driver, `date`, `timestamp`, `timestamptz` and `interval` come back as strings, so use a type map that says so.
:::

### Overrides

Drizzle's types don't record `withTimezone`, so `timestamp()` columns are `timestamp` and `time()` columns are `time`. Pin a column with `pgType`, which returns the builder unchanged at runtime and also works for `customType` columns:

<<< @/snippets/orm-drizzle-schema.ts#pgtype

Or set the default for all columns. The same options take Drizzle's `casing` setting:

<<< @/snippets/orm-drizzle.ts#options

Enums are found by matching an exported `pgEnum`. Name the export after the SQL type (`export const mood = pgEnum("mood", …)`) so casts like `'happy'::mood` resolve. A column whose enum isn't exported is `text`.

The other gaps (generated-always columns, `$onUpdate`, `.$type<T>()`, `text({ enum })`) are listed in [Limits](./limits#orm-schemas).

## Prisma

```sh
npm install @typesql/core @typesql/prisma
```

`@prisma/client` 7 or later is a peer dependency. Only the `postgresql` provider is supported. [Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagAoBOGAzgLYCGoAFAAJYywkCOANsNMeRQJQB0EHLFAM4LVgFpOpSqADmsAHaxCFLAHtC6YliYihoACIAhUBkW7CAMwoBjYQCNYrdWgBQIUOsWhYANxVIUAADaW55JRU1WGCAGnRsPFxhABM1CgcKElgAchIvNB9FCjI9OkpoHnjirAwAkUZ8uhSHPgAqHlAKRRSPMBTYGwBXViwSAQAlCjRQJFRkn0IhxXzcQnUhuTxIDa0iGQoAYVYMJSwBAAl1AK1k0EImEbG+Pr7Qd4VlVQ1bxrZQADeb3e7041wwAy0AF5QAAiURMNhSLiUWHAkEbLDQIZYEEw2F8PjAEiEWzAFrABHiPhjNGed4AXzcbgwZGgmlxCMBoEO6lY8QA4pFvrAUvEAHIjVgZVjCBmgKzrMhw+h-di2TSwWEAbhZbI53NsD2i8DY8S5+24UzQx1OFlA8sV6mVsNVYjYHBRFB1zM8JLJFKpbBpJHiWQiX2ivXMlhs9iMpiBAEhgG02gQvaAyOoBqwQgBVbKEYICNrANxJoZFkgALkBFaTELrQsjuhSAB5YTGACywgB8uqTSdglAwrDrvNYnb8FFJOFn-cHKbTGYOCtOrBSIWKpRLoDLDZSpGg0sgAH0d7A65LWNKHLLO7oAB5YRcN9ay5vCqOdiZ8rUDg2qbpsEtBDNAaRtgAglgwR1tkuIOEElqyLaZzVOooCQRkWSpIMFBPKW5ZDuBkGijBE58o+rJMFgJTQG+SYMoOwGruE2a5iE+DqCQsFERW7K8bW9ZDk2PJUbCQxDBCjHLumKFUFYG5bsEBG4JoACSKR7geQ5qTgmhnmJk6dj2sm1Fgn7iVO8KwC+sl+KcaDCS2URtqZFgAByMcxFYACRUnWyZJn+VmwlBhgALIaeKsKgAAPnC+bwAAohMPpMbqTJuAMtjSg8oAaisuJhJQdYKdaaEWNqoCeDsQx7F6VVYG4RW8aA4igDCRqwCabDtiYfbUKVvA1Z4SwrF4Ph+cwQyBNa+YrBQViwGGrBoBQkD5JguCgA45hbtAs4lLAlgkMybW4hQKRkOY+QwtMFDYB1bDUBWwSpcgKWHOAZhilhx6nheJ3xJJEFRjBcUAGITAA8pFoBVio+QAOoXGlKX3P+XWgH5ACMcQVuFUUxbCsRuPwdmwLYOKwNQPC6vS7wAHoAPy+mAf7OV0BUIlu4YzXNhCQNa9ynQ1k3JGQdYxp5Zj5PtcgxtUQylMQtjy0Y1OshQrAvJdHV0WMOOPc94hvUmH0pV9P1dDiBmEEZ-0assWDUB0oBQfAoCCWM8QkKr1CObAzmdF7oDB9zMPwz7PHGwKcP5vgoDGAAmnb6mOxChOU0+1O0-TjNgCCbMXd47W5qdoomxtZvBlgqhLbYtTeNQ1BYE+nRQn2FYd9QwSGNbKXgJj0cI77qPoxMmP6YZEI4-jcSgHjuf57ovKu-T5MM+ioCl28E98PPpCgLQAzDKM1BSRC9M8OVmbNeut75M95jxNxvFyA8+QpOoeiKOoc4bhzbBBiqlCYv0YrgFhrHISNBZ5Z3+hZWUnQABqUFkD5hSt7ag+N4h+QAEw8CXnjUGFxnAuFhAzWqYAVDrEIDLLc858gAKwukTI2QsL4SeG4IAA) <!-- playground:prisma -->.

Prisma Client's types leave out the database names and native types, so `@typesql/prisma` has a generator that writes the exact schema. Add it to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` interface with the database's own names (`@map`, `@@map`), native types (`@db.*`), database defaults, enums and `@@schema` namespaces:

<<< @/snippets/orm-prisma.ts#generated

<<< @/snippets/orm-prisma.ts#query

Only database defaults (`autoincrement()`, `now()`, `dbgenerated()`, literals) make a column optional in `INSERT`. `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, so a raw `INSERT` must set them.

| Generator option | Default | |
|---|---|---|
| `output` | required | a `.ts` file, or a directory (writes `index.ts`) |
| `typeName` | `"DB"` | name of the exported interface |
| `importFrom` | `"@typesql/core"` | module the `Col` / `Nullable` / … helpers are imported from |

### Running queries

`createSql<DB>(prisma)` takes a `PrismaClient`, an extended client or a transaction client. Queries run with `$queryRawUnsafe` and `$executeRawUnsafe`; despite the names, values are always sent as bind parameters. `sql.transaction(fn)` runs in an interactive `prisma.$transaction(fn)`.

Rows are typed with what `$queryRaw` returns: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`, and dates are `Date` (full table in [Type mapping](../reference/type-mapping#prisma)). Prisma rejects some types (`interval`, geometric types, ranges), so cast them in SQL (`duration::text`). To run queries on another driver, use that driver's `createSql<DB>(client)` with the generated `DB`.

### Without the generator: `FromPrisma`

`createSql<Prisma.TypeMap>()` converts the client Prisma already generates. Its types don't record database names or native types, so tables and columns are the model and field names (quote them in SQL, since Postgres folds unquoted names to lower case), and types are the connector's defaults (`DateTime` is `timestamp`). Supply what's missing as overrides:

```ts
import { createSql, type FromPrisma } from "@typesql/prisma";
import type { Prisma } from "./generated/prisma/client";

const sql = createSql<Prisma.TypeMap>();
sql('SELECT id, "createdAt" FROM "User" WHERE role = $1', "ADMIN");

type DB = FromPrisma<Prisma.TypeMap, {
  User: {
    $table: "users"; // @@map("users")
    name: { column: "display_name" }; // @map("display_name")
    email: "varchar"; // @db.VarChar(200)
    updatedAt: { default: false }; // @updatedAt has no database default
  };
  Account: { $schema: "auth" }; // @@schema("auth")
}>;
```

`FromPrisma` treats every field that is optional in Prisma's create input as having a default, client-side defaults and `@updatedAt` included. Mark those `{ default: false }`, or use the generator.
