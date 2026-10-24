# Prisma

`@typesql/prisma` runs queries through Prisma Client's raw query methods. Prisma Client's types
leave out the database names and native types, so the package also has a generator that writes
the exact schema.

```sh
pnpm add @typesql/core @typesql/prisma
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagAoBOGAzgLYCGoAFAAJYywkCOANsNMeRQJQB0EHLFAM4LVgFpOpSqADmsAHaxCFLAHtC6YliYihoACIAhUBkW7CAMwoBjYQCNYrdWgBQIUOsWhYANxVIUAADaW55JRU1WGCAGnRsPFxhABM1CgcKElgAchIvNB9FCjI9OkpoHnjirAwAkUZ8uhSHPgAqHlAKRRSPMBTYGwBXViwSAQAlCjRQJFRkn0IhxXzcQnUhuTxIDa0iGQoAYVYMJSwBAAl1AK1k0EImEbG+Pr7Qd4VlVQ1bxrZQADeb3e7041wwAy0AF5QAAiURMNhSLiUWHAkEbLDQIZYEEw2F8PjAEiEWzAFrABHiPhjNGed4AXzcbgwZGgmlxCMBoEO6lY8QA4pFvrAUvEAHIjVgZVjCBmgKzrMhw+h-di2TSwWEAbhZbI53NsD2i8DY8S5+24UzQx1OFlA8sV6mVsNVYjYHBRFB1zM8JLJFKpbBpJHiWQiX2ivXMlhs9iMpiBAEhgG02gQvaAyOoBqwQgBVbKEYICNrANxJoZFkgALkBFaTELrQsjuhSAB5YTGACywgB8uqTSdglAwrDrvNYnb8FFJOFn-cHKbTGYOCtOrBSIWKpRLoDLDZSpGg0sgAH0d7A65LWNKHLLO7oAB5YRcN9ay5vCqOdiZ8rUDg2qbpsEtBDNAaRtgAglgwR1tkuIOEElqyLaZzVOooCQRkWSpIMFBPKW5ZDuBkGijBE58o+rJMFgJTQG+SYMoOwGruE2a5iE+DqCQsFERW7K8bW9ZDk2PJUbCQxDBCjHLumKFUFYG5bsEBG4JoACSKR7geQ5qTgmhnmJk6dj2sm1Fgn7iVO8KwC+sl+KcaDCS2URtqZFgAByMcxFYACRUnWyZJn+VmwlBhgALIaeKsKgAAPnC+bwAAohMPpMbqTJuAMtjSg8oAaisuJhJQdYKdaaEWNqoCeDsQx7F6VVYG4RW8aA4igDCRqwCabDtiYfbUKVvA1Z4SwrF4Ph+cwQyBNa+YrBQViwGGrBoBQkD5JguCgA45hbtAs4lLAlgkMybW4hQKRkOY+QwtMFDYB1bDUBWwSpcgKWHOAZhilhx6nheJ3xJJEFRjBcUAGITAA8pFoBVio+QAOoXGlKX3P+XWgH5ACMcQVuFUUxbCsRuPwdmwLYOKwNQPC6vS7wAHoAPy+mAf7OV0BUIlu4YzXNhCQNa9ynQ1k3JGQdYxp5Zj5PtcgxtUQylMQtjy0Y1OshQrAvJdHV0WMOOPc94hvUmH0pV9P1dDiBmEEZ-0assWDUB0oBQfAoCCWM8QkKr1CObAzmdF7oDB9zMPwz7PHGwKcP5vgoDGAAmnb6mOxChOU0+1O0-TjNgCCbMXd47W5qdoomxtZvBlgqhLbYtTeNQ1BYE+nRQn2FYd9QwSGNbKXgJj0cI77qPoxMmP6YZEI4-jcSgHjuf57ovKu-T5MM+ioCl28E98PPpCgLQAzDKM1BSRC9M8OVmbNeut75M95jxNxvFyA8+QpOoeiKOoc4bhzbBBiqlCYv0YrgFhrHISNBZ5Z3+hZWUnQABqUFkD5hSt7ag+N4h+QAEw8CXnjUGFxnAuFhAzWqYAVDrEIDLLc858gAKwukTI2QsL4SeG4IAA) <!-- playground:prisma --> to hover the types and edit the SQL, with nothing to install.

`@prisma/client` 7 or later is a peer dependency, and only the `postgresql` provider is
supported.

## The generator

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

## Running queries

`createSql<DB>(prisma)` runs `execute*` with `$queryRawUnsafe(text, ...values)` and
`executeCount` with `$executeRawUnsafe(text, ...values)`. Despite the names, the values are
always sent as bind parameters (`$1`, `$2`, …). `prisma` may be a `PrismaClient`, an extended
client or a transaction client. `sql.transaction(fn)` runs in an interactive
`prisma.$transaction(fn)`; inside one, `tx.transaction(fn)` uses a savepoint.

## `PrismaTypeMap`

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
another driver, use that adapter's `createSql<DB>(client)` with the generated `DB`.

## Without the generator: `FromPrisma`

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
