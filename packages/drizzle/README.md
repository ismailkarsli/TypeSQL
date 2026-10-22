# @typesql/drizzle

Use your Drizzle ORM schema as a typesql schema. `FromDrizzle<typeof schema>` turns
`pgTable`, `pgView`, `pgMaterializedView`, `pgEnum` and `pgSchema` definitions into the
`DB` type that `createSql` expects, entirely at the type level: no code generation, and the
SQL you write is checked against the same tables Drizzle manages.

```sh
npm install @typesql/drizzle @typesql/core
```

`drizzle-orm` (0.45 or later) is a peer dependency. Queries run on node-postgres or postgres.js
databases.

## Usage

```ts
// schema.ts — your existing Drizzle schema
import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const mood = pgEnum("mood", ["happy", "sad"]);

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: text().notNull(),
  displayName: text("display_name"),
  mood: mood(),
});

export const posts = pgTable("posts", {
  id: serial().primaryKey(),
  authorId: integer("author_id").notNull().references(() => users.id),
  title: text().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
```

```ts
// db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createSql } from "@typesql/drizzle";
import * as schema from "./schema";

const db = drizzle(new Pool(), { schema });
const sql = createSql<typeof schema>(db);

const q = sql(
  "SELECT u.email, u.display_name, p.title FROM users u JOIN posts p ON p.author_id = u.id WHERE u.mood = $1",
  "happy",
);
// Query<{ email: string; display_name: string | null; title: string }, ["happy" | "sad"]>

const post = await sql("INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id, created_at", 1, "Hello").executeTakeFirstOrThrow();
// id and created_at have defaults, so they can be left out

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

Queries use SQL names: `display_name`, not `displayName`. Relations and any other
non-table exports are ignored, so `typeof schema` can be passed as is.

`createSql<Schema, TypeMap, Options>(db)` uses core's `DefaultTypeMap` unless you pass
another one, such as `PgTypeMap` from `@typesql/pg` for node-postgres' exact types:
`createSql<typeof schema, PgTypeMap>(db)`.

## Running queries

`db` is a Drizzle database on node-postgres or postgres.js (`drizzle-orm/node-postgres`,
`drizzle-orm/postgres-js`), or a transaction from `db.transaction(fn)`. Queries run on the
driver client Drizzle holds: the `Pool`, `Client` or postgres.js `sql` you gave `drizzle()`, or
the transaction's connection. Rows are what the driver returns; Drizzle's column mappers and
its logger are not involved.

| | |
|---|---|
| `q.execute()`, `q.executeTakeFirst()`, `q.executeTakeFirstOrThrow()`, `q.executeCount()` | `Promise<Row[]>`, `Promise<Row \| undefined>`, `Promise<Row>` (`NoResultError` on 0 rows), `Promise<number>` (the driver's row count) |
| `sql.transaction(fn)` | `db.transaction(fn)` with `tx` bound to the transaction; `tx.transaction(fn)` is Drizzle's nested transaction (a savepoint) |
| `executor(db)` | an `Executor` for `q.execute(executor)` and core's `createSql(executor)` |
| `DrizzleSql<Schema, TM, Options>`, `DrizzleDatabase` | the type `createSql` returns, and what it accepts |

To mix ORM and SQL queries in one transaction, bind a `sql` to Drizzle's `tx`:

```ts
await db.transaction(async (tx) => {
  await tx.insert(schema.users).values({ email: "a@b.c" });
  await createSql<typeof schema>(tx)("UPDATE users SET mood = 'happy' WHERE email = $1", "a@b.c").execute();
});
```

`drizzle-orm/postgres-js` turns off postgres.js' date parsers on the client it is given, so on
that driver `date`, `timestamp`, `timestamptz` and `interval` come back as strings: pass a type
map that says so.

To pair the schema with a driver adapter instead, convert it with `FromDrizzle` and use the
adapter's `createSql` on the same pool:

```ts
import { createSql } from "@typesql/pg";
import type { FromDrizzle } from "@typesql/drizzle";
import type * as schema from "./schema";

const sql = createSql<FromDrizzle<typeof schema>>(pool);
```

`FromDrizzle` also accepts a single table (`FromDrizzle<typeof users>`) or a record of
tables (`FromDrizzle<{ users: typeof users; posts: typeof posts }>`).

## What gets converted

| Drizzle | typesql |
|---|---|
| `pgTable("users", …)` | `DB["users"]`, keyed by the SQL table name, not the export name |
| `displayName: text("display_name")` | column `display_name`; columns without an explicit name use the key |
| `.notNull()`, `.primaryKey()`, `serial`, identity | `NOT NULL`; otherwise the column is nullable |
| `.default(…)`, `.defaultNow()`, `.defaultRandom()`, `serial`, `generatedAlwaysAsIdentity()`, `generatedByDefaultAsIdentity()`, `generatedAlwaysAs(…)` | has a default: optional in `INSERT` |
| `.$defaultFn(…)` / `.$default(…)` | **no** default: these run in Drizzle, not in Postgres |
| `export const mood = pgEnum("mood", […])` | `DB["$types"]["mood"]`, keyed by the **export name** (see below) |
| `pgSchema("auth").table("users", …)` | `DB["auth"]["users"]` (`auth.users` in SQL) |
| `pgView(…)`, `pgMaterializedView(…)` | a `View<…>`: readable, rejected as an `INSERT`/`UPDATE`/`DELETE` target |
| `relations(…)`, sequences, other exports | ignored |

## Column types

The Postgres type comes from Drizzle's column kind. Drizzle's `mode` options change the JS
value Drizzle produces, but typesql queries go straight to the driver, so the row type comes
from the type map: `bigint({ mode: "number" })` is `int8`, a `string` under node-postgres.

| Drizzle | Postgres |
|---|---|
| `smallint`, `smallserial` | `int2` |
| `integer`, `serial` | `int4` |
| `bigint`, `bigserial` (any mode) | `int8` |
| `numeric` / `decimal` (any mode) | `numeric` |
| `real` | `float4` |
| `doublePrecision` | `float8` |
| `boolean` | `bool` |
| `text` | `text` |
| `varchar` | `varchar` |
| `char` | `bpchar` |
| `uuid` | `uuid` |
| `date` (any mode) | `date` |
| `time` | `time`, or `timetz` (see below) |
| `timestamp` (any mode) | `timestamp`, or `timestamptz` (see below) |
| `interval` | `interval` |
| `json`, `jsonb` | `json`, `jsonb` |
| `inet`, `cidr`, `macaddr`, `macaddr8` | same name |
| `point` (any mode), `line` (any mode) | `point`, `line` |
| `geometry` (PostGIS) | `geometry` |
| `vector`, `halfvec`, `sparsevec`, `bit` (pgvector) | `vector`, `halfvec`, `sparsevec`, `bit` |
| an enum column | the enum's export name, values in `$types` |
| `customType(…)` | `unknown`, unless pinned with `pgType` |
| `.array()`, `.array().array()` | `T[]`, `T[][]` |

Types typesql has no TS mapping for (`geometry`, `vector`, …) read as `unknown` unless your
type map has an entry for them.

### `timestamp` with time zone, and other types Drizzle's types do not record

`timestamp("at", { withTimezone: true })` and `timestamp("at")` have the same TypeScript type
in Drizzle, so `FromDrizzle` cannot tell them apart. Both read as `Date` under the default
type maps, but `timestamp` and `timestamptz` behave differently in SQL (`AT TIME ZONE`,
`date_trunc`, comparisons with `now()`). Either set the default for all of them:

```ts
createSql<typeof schema, DefaultTypeMap, { timestamp: "timestamptz"; time: "timetz" }>(db);
// or: FromDrizzle<typeof schema, { timestamp: "timestamptz" }>
```

or pin a column's type with `pgType`, which returns the builder unchanged at runtime:

```ts
import { pgType } from "@typesql/drizzle";

export const events = pgTable("events", {
  at: pgType(timestamp("at", { withTimezone: true }).notNull(), "timestamptz"),
  handle: pgType(citext("handle"), "text"), // a customType
});
```

`pgType` takes precedence over everything else and works for any column. For an array
column, wrap the whole array: `pgType(citext().array(), "text[]")`.

### Enums

Drizzle's types do not carry an enum's SQL name (`pgEnum("mood", …)` is typed as
`string`), so enums are registered in `$types` under their **export name**, and an enum
column is typed by finding the exported enum with the same values. To use casts such as
`'happy'::mood`, name the export like the SQL type (`export const mood = pgEnum("mood", …)`).
Object enums need `as const` (`pgEnum("role", { Admin: "admin" } as const)`) for their
values to be known. An enum column whose enum is not exported (or when you pass only a
table or a record of tables) is typed as `text`.

### `casing`

If you create Drizzle with `drizzle(client, { casing: "snake_case" })`, pass the same
setting so column names match what Drizzle sends to Postgres:

```ts
createSql<typeof schema, DefaultTypeMap, { casing: "snake_case" }>(db);
// createdAt: timestamp() → column created_at
```

## Limitations

- **Generated-always columns** (`generatedAlwaysAs`, `generatedAlwaysAsIdentity`) are treated
  as columns with a default. typesql has no read-only columns, so an `INSERT` that sets one
  type-checks but fails in Postgres (unless `OVERRIDING SYSTEM VALUE` for identities).
- **`$onUpdate` / `$onUpdateFn`** mark the column as having a default in Drizzle's types, with
  no way to tell them from a SQL default, so such a column is optional in `INSERT` even
  though Postgres will not fill it.
- **`.$type<T>()`** is ignored: rows use the type map (`jsonb().$type<Settings>()` is
  `unknown` under the default map). Branded ids lose their brand.
- **`text({ enum: [...] })`, `varchar({ enum: [...] })`** are plain `text` / `varchar`: the
  values are only a TypeScript constraint in Drizzle, not a Postgres type.
- **Views** take their column types from the selected Drizzle columns. Columns from the
  outer side of a join keep their own nullability, and `sql\`…\`.as("x")` fields are
  `unknown`. Views created with `pgSchema(…).view(…)` are placed at the top level, because
  Drizzle's view types do not record the schema.
- **`pgTableCreator`** prefixes are applied at runtime only; tables appear under the name
  passed to the table function.
- **`casing`** is applied to every column name, including explicitly named ones; Drizzle
  applies it only to columns named after their key. These agree unless an explicit name is
  not already in the target casing.
- Multi-dimensional arrays are typed `T[][]`; Postgres itself does not distinguish them
  from `T[]`.

## Examples

[`examples/schema.ts`](examples/schema.ts) and [`examples/basic.ts`](examples/basic.ts) walk through the features above; they are type-checked with the package (`pnpm typecheck`).
