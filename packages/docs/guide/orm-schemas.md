# ORM schemas

If your database is already described for Kysely, Drizzle or Prisma, you do not need to write
the schema interface again. These packages turn the ORM's types into the `DB` that `createSql`
expects, so you can write SQL next to your ORM code, checked against the same tables:

| Package | Schema from | Runs queries with | Default type map |
|---|---|---|---|
| `@typesql/kysely` | your Kysely `DB` interface (kysely-codegen, prisma-kysely, hand-written) | `query`/`execute` on a `Kysely` or `Transaction` | `DefaultTypeMap` (node-postgres) |
| `@typesql/drizzle` | `typeof schema`: your `pgTable`, `pgView`, `pgEnum`, `pgSchema` exports | a driver adapter, on the pool Drizzle uses | `DefaultTypeMap` (node-postgres) |
| `@typesql/prisma` | the `typesql-prisma` generator, or the generated client's `Prisma.TypeMap` | `queryRaw`/`executeRaw` on Prisma Client | `PrismaTypeMap` (`$queryRaw` results) |

The Kysely and Drizzle conversions happen only at the type level: there is no code generation
and no database connection. Prisma's types leave out the database names and native types, so
`@typesql/prisma` also has a generator that writes the exact schema.

The ORM's types say less than the database does, so each conversion has some gaps. They are
listed in each section below. Each package's `createSql` passes extra type arguments through,
so you can fill those gaps in.

## Kysely

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

### Overrides

That mapping is lossy: `number` also stands for `int2`, `float4` and `float8`, `string` also
stands for `uuid`, `varchar` and `time`, and `Timestamp` also stands for `date` and `timestamp`.
Row types are the same either way. Expression types differ: division, aggregates, date
arithmetic. Pin the columns where it matters with the third type argument, keyed by the
interface's table and column keys:

<<< @/snippets/orm-kysely.ts#overrides

An override is a type name (`"float8"`) or a partial descriptor
(`{ type?, nullable?, hasDefault? }`). `{ $view: true }` marks a table as a view, so writes
to it are rejected. Without `$types`, each enum column gets its own name (`users.mood`). Two
columns then count as different enums, and `UNION`ing them is an error, just as it would be
for two different Postgres enums.

### camelCase

For an interface generated with `kysely-codegen --camel-case` (used with `CamelCasePlugin`),
pass `{ camelCase: true }`. SQL and rows then use the database's snake_case names:

<<< @/snippets/orm-kysely.ts#camel

### Running queries

<<< @/snippets/orm-kysely.ts#run

The query is sent as `CompiledQuery.raw(text, values)` through `db.withoutPlugins()`. Logging,
the dialect and the pool still apply, but result transformers such as `CamelCasePlugin` do
not, so rows keep the keys their type says they have. Kysely's `PostgresDialect` runs on `pg`.
For the exact `pg` types (`Buffer` for `bytea`, interval objects), pass `PgTypeMap` as the
second type argument: `createSql<DB, PgTypeMap>()`.

### Limits

- JSON columns always count as nullable, because codegen's `JsonValue` includes `null`.
  Override `{ nullable: false }` to have `INSERT` require them.
- A column only has a default if it is declared `Generated`/`GeneratedAlways`. Mark other
  columns with `{ hasDefault: true }`.
- Views look like tables until you mark them with `$view: true`.

## Drizzle

```sh
pnpm add @typesql/core @typesql/drizzle drizzle-orm
```

Pass your schema module as it is. Tables, views, enums and schemas are converted; relations
and any other exports are ignored:

<<< @/snippets/orm-drizzle-schema.ts#schema

<<< @/snippets/orm-drizzle.ts#query

SQL uses the database names (`display_name`), not the TypeScript keys (`displayName`).

| Drizzle | typesql |
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
Drizzle's `mode`: typesql queries go straight to the driver, so a `bigint({ mode: "number" })`
column is `int8`, which node-postgres returns as a `string`.

### Types Drizzle does not record

Drizzle's types do not record `withTimezone`, so `timestamp()` columns are `timestamp` and
`time()` columns are `time`. Pin a column with `pgType`, which returns the builder unchanged
at runtime and also works for `customType` columns:

<<< @/snippets/orm-drizzle-schema.ts#pgtype

Or set the default for all columns. The same options take Drizzle's `casing` setting:

<<< @/snippets/orm-drizzle.ts#options

Enums are typed by finding the exported `pgEnum` with the same values. Name the export after
the SQL type (`export const mood = pgEnum("mood", …)`) so casts like `'happy'::mood` resolve.
If an enum isn't exported, its columns are `text`.

### Running queries

Drizzle has no API for typed raw rows, so run typesql queries with a driver adapter on the pool
you pass to `drizzle()`. Convert the schema with `FromDrizzle` and use the adapter's
`createSql`, which comes with that driver's type map:

<<< @/snippets/orm-drizzle.ts#adapter

### Limits

- Generated-always columns count as having a default. Postgres rejects an `INSERT` that sets
  one, but typesql doesn't.
- `$onUpdate` columns look like they have a default, so `INSERT` doesn't require them.
- `.$type<T>()` is ignored; rows use the type map (`jsonb().$type<T>()` is `unknown`).
- `text({ enum: [...] })` is plain `text`: in Drizzle, those values are only a TypeScript
  constraint.

## Prisma

```sh
pnpm add @typesql/core @typesql/prisma
```

`@prisma/client` 7 or later is a peer dependency, and only the `postgresql` provider is
supported.

### The generator

Add the generator to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` interface with the database's own names (`@map`,
`@@map`), native types (`@db.*`), database defaults, enums (with `@map`'ped values) and
`@@schema` namespaces:

<<< @/snippets/orm-prisma.ts#generated

<<< @/snippets/orm-prisma.ts#query

Defaults are separated by where they run. `autoincrement()`, `now()`, `dbgenerated()` and
literal defaults are database defaults, so `INSERT` doesn't need them. `uuid()`, `cuid()`,
`nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, so a raw `INSERT` must
set them.

| Generator option | Default | |
|---|---|---|
| `output` | required | a `.ts` file, or a directory (writes `index.ts`) |
| `typeName` | `"DB"` | name of the exported interface |
| `importFrom` | `"@typesql/core"` | module the `Col`/`Nullable`/… helpers are imported from |

### Running queries

`queryRaw(prisma, q)` and `executeRaw(prisma, q)` call `$queryRawUnsafe(text, ...values)` and
`$executeRawUnsafe(text, ...values)`. Despite the names, the values are always sent as bind
parameters (`$1`, `$2`, …). Both return a `PrismaPromise`, so they work inside
`prisma.$transaction([...])`, and they also accept a transaction client.

`createSql` from `@typesql/prisma` uses `PrismaTypeMap`, which describes what `$queryRaw`
returns:

| Postgres | TS |
|---|---|
| `int2`, `int4`, `float4`, `float8` | `number` |
| `int8` (so `count(*)`), `oid` | `bigint` |
| `numeric`, `money` | `Decimal` |
| `date`, `timestamp`, `timestamptz`, `time`, `timetz` | `Date` |
| `bytea` | `Uint8Array` |
| `json`, `jsonb` | `JsonValue` |
| text-like types, enums | `string` (enums: their values) |

Prisma throws "Unsupported column type" for other types (`interval`, geometric types, ranges);
they are `unknown` here, so cast them in SQL (`duration::text`). To run the queries with
another driver, pass its type map: `createSql<DB, PgTypeMap>()`.

### Without the generator: `FromPrisma`

`createSql<Prisma.TypeMap>()` converts the client Prisma already generates, with no extra
generator. Prisma Client's types do not record database names or native types. Tables and
columns are therefore the model and field names, and they must be quoted in SQL because
Postgres folds unquoted names to lower case. Types are the connector's defaults (`DateTime`
is `timestamp`). Supply what's missing as overrides:

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

`FromPrisma` treats every field that is optional in Prisma's create input as having a default.
That includes client-side defaults and `@updatedAt`, so mark those `{ default: false }`, or
use the generator.
