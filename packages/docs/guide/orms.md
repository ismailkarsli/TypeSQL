# From Kysely, Drizzle or Prisma

If Kysely, Drizzle or Prisma already describes your database, you don't need to write the schema again. TypeSQL's package for your ORM turns its types into the schema `createSql` needs, so you can write SQL next to your ORM code, checked against the same tables.

| Package | Schema from | Runs queries on |
|---|---|---|
| [`@typesql/kysely`](#kysely) | your Kysely `DB` interface (kysely-codegen, prisma-kysely or hand-written) | a `Kysely` instance or transaction |
| [`@typesql/drizzle`](#drizzle) | your Drizzle schema module (`pgTable`, `pgView`, `pgEnum`, `pgSchema`, or `sqliteTable`, `sqliteView`) | the driver client under your Drizzle database (SQLite: the database itself) |
| [`@typesql/prisma`](#prisma) | the `typesql-prisma` generator, or Prisma Client's `Prisma.TypeMap` | Prisma Client or a transaction client |

An ORM's types say less than the database does, so each conversion has a few gaps, which you can fill with overrides.

Each package's `createSql` takes the SQL [dialect](../reference/api#dialects) as its first argument: `postgres` from `@typesql/core/postgres`, or `sqlite` from `@typesql/core/sqlite` (see [SQLite](#sqlite)). The schema comes from the ORM's database type, so `createSql(postgres, db)` needs no type argument; pass one (`createSql<DB>(postgres, db)`) to add overrides, pick a type map or build queries without a client. The type map defaults to the dialect's (`DefaultTypeMap`); `@typesql/prisma` defaults to `PrismaTypeMap`.

::: tip
For the exact Postgres types without overrides, [generate the schema from the database](./introspect) instead, and keep the ORM for the queries it builds.
:::

## Kysely

```sh
npm install @typesql/core @typesql/kysely kysely
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzpAzjA5lApiuBfOAMyghDgCIABGATzBwEcAbAegGNosXUNsVyA3AChQkWIjhtsAQxhYAys3xESZKrXopmLANY0UWJjUEjw0eAiEBIDVjgBhCEwCuIAHYAVOlgA0123AA4lhuWFCyWAAmflYA0vqGNDEAChBomDgAIsDSTFhsMH4ExKQUegZGJqLmEqlOyiVqYOgmQgEAkm4wABxwALwOTq6e3gA81mhQwG7oMQBGwOjT8AA+cG6uc2Fwa5PTs9YLS10765vbuzBTM0IAfMIBHqA4MNLg-YMu7l70o5kRPjg-zkpz2M0BwLsl2u6HubW8cAAshAIJEPuQABbSMBgYyncgoaSRVrLMKEaRsOyZABCiGszgMUBQAC46VYrMBIqzgqFwnJIqMNiAtlA4eysCBpMAmKywehhOyQCiuUjlacNkwmAqrFIsBFIgB9WTckJhfWjJ4gF5vMBivAKngstkclU8s380adHpiqzSZwwDHQA2c1lCkXamDAGB5WVXfbasDOOZMYAoDFRE2881zFF5aRuO3CPBCIQcNxoOCROYfUIAdzg8QqND+1NuAApLFZIjk8gVQ1h66l0nxsrl8jAO8hc-3B7m2wBKfDzorz4RlitaJgfXURRRMNs8DIoQFV1cl9fwSLhQgwXADaS1qWXubWAB0FXHADFVG3yI7yPOb4fgUbYANrkJy5CAuQkbRlg5AALqAVYr61um2C-omyapumxLQX0UFELkBjIa+WAAB75P6WALsIpYQOW8B5pEYQ5tIUBogMm5ttYAAG8gAKIADICfYHhwM4ZGStKgKSUqqKAhwzhdAer6couACC8hTmgx5CHABmGUZxkmaZhnhG4OgLnAADyABqAkAEpwG2NmOZkTlwNSACakgQMpE5gGpkSLh58j2Jp2lgEwFJYPpZkJSZn6OTZiISYyuDOHAImfuJABSNntAAcjpt7ILZJVBX6AZBpyHySXVGlFZkyCvlhKZplE8WJT1cAAOoABJOQJEmvvJnFwAAJAAjN1vUJYEKUAKrJF5vkNZEvExJi2K4lBQhnhecAWToUQfA+T5wMxrEQOxkRkZRbDUbRJYXVGlZzK+Vz5oSBTAAxC4PVRchttIKA0G4bAuVc5GLn0txsm98Aw9YKHOGAkQRB40jJjRf5pLeAGo++WATkg7U4RmcBXM4dh4MhKFoWEePVYGUDBnhFAEYC00M0DT0g2evqPu9O5yHuB4E0egIw-OPHsrxHkiR4I3JalpW4INw1wKztUTTNcBNS1RU2eJFOdZtMRWNNMTzvzz1nvTdHcfxwmieJdVq2lDJhJrQ2OSN40fDNW0UPmmDGGeQA) <span data-playground="kysely"></span>.

Pass the same `DB` interface you give to `new Kysely<DB>()`. The conversion happens in the type checker: no code generation, no database connection.

```ts
import type { ColumnType, Generated, GeneratedAlways } from "kysely";

export type Int8 = ColumnType<
	string,
	bigint | number | string,
	bigint | number | string
>;
export type Numeric = ColumnType<string, number | string, number | string>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type Mood = "happy" | "sad";

export interface DB {
	users: {
		id: Generated<number>;
		email: string;
		mood: Mood | null;
		balance: Numeric;
		created_at: Generated<Timestamp>;
	};
	posts: {
		id: GeneratedAlways<Int8>;
		author_id: number;
		title: string;
		published: Generated<boolean>;
		score: number | null;
	};
	"auth.sessions": {
		id: Generated<Int8>;
		user_id: number;
		expires_at: Timestamp;
	};
}
```

```ts
import { createSql } from "@typesql/kysely";
import { postgres } from "@typesql/core/postgres";

const sql = createSql(postgres, db);

const q = sql(
	`SELECT u.email, u.mood, p.id, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1 AND p.published`,
	"happy",
);

sql("SELECT s.expires_at FROM auth.sessions s WHERE s.user_id = $1", 1);
sql(
	"INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id",
	1,
	"Hello",
);
```

Kysely describes columns with TypeScript types, so TypeSQL reads the Postgres type back from them:

| Kysely column type | Postgres type |
|---|---|
| `number` / `string` / `boolean` / `bigint` | `int4` / `text` / `bool` / `int8` |
| `Date`, codegen's `Timestamp` | `timestamptz` |
| codegen's `Int8` / `Numeric` | `int8` / `numeric` |
| `Buffer`, `Uint8Array` | `bytea` |
| `Interval`, `Point`, `Circle` | `interval`, `point`, `circle` |
| `Json`, `JSONColumnType<T>`, other objects | `jsonb`, nullable when the select type includes `null` (codegen's `JsonValue` does). Rows read it as `unknown`, not `T`; give the column a type in SQL or assert the row with `sql.as<Row>()` |
| `T[]`, `ArrayType<T>` | element type `[]` |
| a union of string literals (codegen enums) | an enum, registered in `$types` |
| `T \| null` | nullable |
| `Generated<T>`, `GeneratedAlways<T>` | has a default: optional in `INSERT` (no other column has one). `GeneratedAlways` columns are not rejected in `INSERT` or `UPDATE`; PostgreSQL rejects writing them at runtime |
| `"auth.users"` key | `auth.users` |

### Running queries

```ts
const drafts = await sql(
	"SELECT id, title FROM posts WHERE NOT published",
).execute();

const published = await sql.transaction((tx) =>
	tx(
		"UPDATE posts SET published = true WHERE author_id = $1",
		1,
	).executeCount(),
);

await db.transaction().execute(async (trx) => {
	await trx
		.updateTable("posts")
		.set({ published: false })
		.where("author_id", "=", 1)
		.execute();
	await createSql(postgres, trx)(
		"DELETE FROM posts WHERE author_id = $1 AND NOT published",
		1,
	).execute();
});
```

Queries run through `db.withoutPlugins()`, so logging, the dialect and the pool apply, but result transformers such as `CamelCasePlugin` don't. Kysely's `PostgresDialect` runs on `pg`: for the exact `pg` types (`Buffer` for `bytea`, interval objects), use `createSql<DB, PgTypeMap>(postgres, db)`.

### Overrides

`number` also stands for `int2`, `float4` and `float8`, `string` for `uuid`, `varchar` and `time`, and `Timestamp` for `date` and `timestamp`. Rows come out the same, but expressions such as division, aggregates and date arithmetic can differ. Pin the columns where it matters with the third type argument:

```ts
const sqlx = createSql<
	DB,
	DefaultTypeMap,
	{
		posts: { score: "float8" };
		$types: { mood: Mood };
	}
>(postgres, db);

sql("SELECT avg(score) FROM posts");
sqlx("SELECT avg(score) FROM posts");
```

- An override is a type name (`"float8"`) or a partial descriptor: `{ type?, nullable?, hasDefault? }`. Use `{ nullable: false }` for a JSON column `INSERT` must set, and `{ hasDefault: true }` for a column with a database default that isn't `Generated`.
- `{ $view: true }` marks a table as a view, so writes to it are rejected.
- Without `$types`, each enum column gets its own name (`users.mood`), so a `UNION` of two such columns is an error, and a cast to the SQL enum type (`'happy'::mood`) is `unknown`. Declare the enum under `$types` (as above) for casts to resolve; the same applies to Drizzle enums that aren't exported.
- Overrides aren't validated against the schema: a misspelled table or column name is ignored, and a misspelled type becomes `unknown`. Hover a query's row type to check them.

### camelCase

For an interface generated with `kysely-codegen --camel-case`, pass `{ camelCase: true }`. SQL and rows then use the database's snake_case names:

```ts
interface CamelDB {
	blogPosts: {
		id: Generated<number>;
		authorId: number;
		createdAt: Generated<Timestamp>;
	};
}

const camel = createSql<
	CamelDB,
	DefaultTypeMap,
	{},
	{ camelCase: true }
>(postgres, camelDb);
camel("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1);
```

Names are converted back to snake_case word by word, so a codegen name that dropped an underscore before a digit or single letter doesn't round-trip: `--camel-case` maps `a_b_c` to `aBC`, which reads back as `a_bc` (Kysely's own `CamelCasePlugin` does the same). Rename such columns, or leave `camelCase` off.

For camelCase rows, as `CamelCasePlugin` would return them, attach `.withPlugin(new CasePlugin())`, importing `CasePlugin` from `@typesql/core`. Only top-level keys are renamed, not keys inside JSON values. See [camelCase row keys](./queries#camelcase-row-keys).

```ts
const camelRows = createSql<
	CamelDB,
	DefaultTypeMap,
	{},
	{ camelCase: true }
>(postgres, camelDb).withPlugin(new CasePlugin());
const post = await camelRows(
	"SELECT author_id, created_at FROM blog_posts WHERE id = $1",
	1,
).executeTakeFirstOrThrow();
```

## Drizzle

```sh
npm install @typesql/core @typesql/drizzle drizzle-orm
```

Pass your schema module as it is. Tables, views, enums and schemas are converted in the type checker; relations and other exports are ignored. SQL uses the database names (`display_name`), not the TypeScript keys (`displayName`).

```ts
import { relations, sql } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	serial,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const mood = pgEnum("mood", ["happy", "sad"]);

export const users = pgTable("users", {
	id: serial().primaryKey(),
	email: text().notNull(),
	displayName: text("display_name"),
	mood: mood(),
});

export const posts = pgTable("posts", {
	id: serial().primaryKey(),
	authorId: integer("author_id")
		.notNull()
		.references(() => users.id),
	title: text().notNull(),
	slug: text()
		.notNull()
		.$defaultFn(() => crypto.randomUUID()),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auth = pgSchema("auth");
export const sessions = auth.table("sessions", {
	id: uuid().primaryKey().defaultRandom(),
	userId: integer("user_id").notNull(),
});

export const happyUsers = pgView("happy_users").as((qb) =>
	qb
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(sql`${users.mood} = 'happy'`),
);

export const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
}));
```

```ts
import { createSql } from "@typesql/drizzle";
import { postgres } from "@typesql/core/postgres";
import type * as schema from "./orm-drizzle-schema.js";

const sql = createSql(postgres, db);

const q = sql(
	`SELECT u.email, u.display_name, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1`,
	"happy",
);

sql(
	"SELECT h.email FROM happy_users h JOIN auth.sessions s ON s.user_id = h.id",
);
sql(
	"INSERT INTO posts (author_id, title, slug) VALUES ($1, $2, $3) RETURNING id, created_at",
	1,
	"Hello",
	"hello",
);
```

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

`createSql(postgres, db)` reads the schema from `db`'s type (the `schema` you passed to `drizzle()`; without one, every query fails with `relation "…" does not exist`) and runs queries on the driver client under `db`: the `Pool`, `Client` or postgres.js `sql` you passed to `drizzle()`, or the transaction's connection inside `db.transaction(fn)`. Pass the driver's type map as the second type argument:

```ts
import type { PgTypeMap } from "@typesql/pg";

const pgSql = createSql<typeof schema, PgTypeMap>(postgres, db);
const rows = await pgSql(
	"SELECT id, title FROM posts WHERE author_id = $1",
	1,
).execute();

await pgSql.transaction(async (tx) => {
	await tx(
		"UPDATE posts SET title = upper(title) WHERE author_id = $1",
		1,
	).execute();
});

await db.transaction(async (tx) => {
	await createSql<typeof schema, PgTypeMap>(postgres, tx)(
		"DELETE FROM posts WHERE author_id = $1",
		1,
	).execute();
});
```

Rows are what the driver returns: Drizzle's column mappers and logger are not involved. Only node-postgres and postgres.js databases are supported.

`drizzle-orm/postgres-js` turns off postgres.js' JSON and date serializers and its date parsers on its client. On that driver TypeSQL serializes `sql.json()` values, objects and `Date` parameters itself, and parses `date`, `timestamp` and `timestamptz` columns (and one-dimensional arrays of them) back to `Date`, so rows match the default type map.

### Overrides

Drizzle's types don't record `withTimezone`, so `timestamp()` columns are `timestamp` and `time()` columns are `time`. Pin a column with `pgType`, which returns the builder unchanged at runtime and also works for `customType` columns:

```ts
import { pgType } from "@typesql/drizzle";

export const events = pgTable("events", {
	at: pgType(timestamp("at", { withTimezone: true }).notNull(), "timestamptz"),
});
```

Or set the default for all columns. The same options take Drizzle's `casing` setting:

```ts
createSql<
	typeof schema,
	DefaultTypeMap,
	{
		casing: "snake_case";
		timestamp: "timestamptz";
	}
>(postgres, db);
```

Drizzle's types don't record `drizzle(…, { casing })`, so pass `casing` here; `createSql(postgres, db)` without type arguments can't see it. Like Drizzle, casing renames only columns declared without a name. An explicit name (`legacy: text("legacyName")`) is kept. The one case the types can't tell apart is an explicit name equal to the key (`legacyName: text("legacyName")`), which is renamed like an unnamed column; give such a column a different key.

Enums are found by matching an exported `pgEnum`. Name the export after the SQL type (`export const mood = pgEnum("mood", …)`) so casts like `'happy'::mood` resolve. A column whose enum isn't exported is `text`.

The other gaps (generated-always columns, `$onUpdate`, `.$type<T>()`, `text({ enum })`) are listed in [Limits](./limits#orm-schemas).

## Prisma

```sh
npm install @typesql/core @typesql/prisma
```

`@prisma/client` 7 or later is a peer dependency. Install the `prisma` CLI of the same major version (`npm install -D prisma@7`); a bare `npm install -D prisma` can pick up a prerelease of the next major whose CLI has no `generate` command. The `postgresql` and `sqlite` providers are supported; this section uses PostgreSQL, and [SQLite](#sqlite) covers the differences. [Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbwFAEgYE8wFM4GEIA2ANKhtnAOJYB2WUAhjFgCYlqY4ByArgQfQCMCWNpADOMAOZQsYkgF84AMygQQcAEQABMrICOBAPQBjaFkPipMsRoDcSUJFiI4xmYywBlA0Ti64AApQwGIg9ABK9ADuuATANPCKKmqaOhxiBhbBofR2SA7UTFBK9MY4ACIAQoio3GJ0YgBcNSgowMzNVLQMTMwAPBrAhQAsGgB89q1YYcAEzfgEAwBu9FDGABar45MozCFg-OgA+tT0IFjNPHyCwgNMAB4w26goqsKdNHQe-RrhhFjPVrcMDMb4AQRg80Id1AshgZzAgPkk0sTRabQ6eGhGm43HagJQ9G4MHW0CO7Shi0GIwJMGAMHeWKpDyeExeS3iUTRXS+vQGQxgAA4kZMACS6NHIVp-RkaMHlACyAElOBo4AAfTQAVU8AFFwnkUMikPJ8swsMZ+DJXBBqBI4GBsmFmkEQmFIjE4gl7KY7fAMgQ4ABeVzuJjeRZVMYACks0lkvkdbvoAEp7Ehffb6MwQEMxMG4NF6PS4AHo6gAAZ6gAyutwABU4O1fHsxAd6MdTudfDiQeCnnAAGLhADyCrgdQacAA6gAJfW6uBvHAh0UARgrbDlipVGhIKYAdFh7hbiVho2n8pn-fCYPmQ0WS2XKzW642iSSyc2bdxCtGAFQpnAYKeA6EASHIpbcCA0YclgXJASBcBwVyQ6juOqKUKOWoBHAlQAJqFsSpJQOSzCbkgh7HqeTAXum15wOawi9AWj7+gYB4wAwdqlHStrRtGMD3EBQZjKQ9zRhW5S6rW9aLsOY5gRBM7zuEi4fiRZEFuum5wGuVEnsYZ74L+MAXvu6ZlhWKp6uEjYqvWI5KXecDRhpX6sH49LCEBABqYLVlquqgdG66+KKABMKa6WuPazlgfAQBol5AA) <span data-playground="prisma"></span>.

Prisma Client's types leave out the database names and native types, so `@typesql/prisma` has a generator that writes the exact schema. Add it to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` interface with the database's own names (`@map`, `@@map`), native types (`@db.*`), database defaults, enums and `@@schema` namespaces:

```ts
import type { Col } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"varchar">;
		display_name: Col<"text", { nullable: true }>;
		role: Col<"Role", { hasDefault: true }>;
		updatedAt: Col<"timestamp">;
	};
	posts: {
		id: Col<"uuid">;
		author_id: Col<"int4">;
		title: Col<"text">;
		views: Col<"int8", { hasDefault: true }>;
	};
	$types: {
		Role: "ADMIN" | "USER" | "guest";
	};
}
```

```ts
import { createSql } from "@typesql/prisma";
import { postgres } from "@typesql/core/postgres";

const sql = createSql<DB>(postgres, prisma);

const q = sql(
	`SELECT id, display_name, "updatedAt" FROM users WHERE role = $1`,
	"guest",
);

const rows = await q.execute();
const stats = await sql(
	"SELECT count(*) AS n, sum(views) AS views FROM posts",
).execute();
const deleted = await sql.transaction((tx) =>
	tx("DELETE FROM posts WHERE author_id = $1", 1).executeCount(),
);
```

Only database defaults (`autoincrement()`, `now()`, `dbgenerated()`, literals) make a column optional in `INSERT`. `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, so a raw `INSERT` must set them.

| Generator option | Default | |
|---|---|---|
| `output` | required | a `.ts` file, or a directory (writes `index.ts`) |
| `typeName` | `"DB"` | name of the exported interface |
| `importFrom` | `"@typesql/core/postgres"` | module `Col`, `View` and `Typed` are imported from |

### Running queries

`createSql<DB>(postgres, prisma)` takes a `PrismaClient`, an extended client or a transaction client. Queries run with `$queryRawUnsafe` and `$executeRawUnsafe`; despite the names, values are always sent as bind parameters. `sql.transaction(fn)` runs in an interactive `prisma.$transaction(fn)`.

Rows are typed with what `$queryRaw` returns: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`, and dates are `Date` (full table in [Type mapping](../reference/type-mapping#prisma)). Prisma rejects some types (`interval`, geometric types, ranges), so cast them in SQL (`duration::text`). To run queries on another driver, use that driver's `createSql<DB>(client)` with the generated `DB`.

### Without the generator: `FromPrisma`

`createSql(postgres, prisma)` without a type argument, or `createSql<Prisma.TypeMap>(postgres)` without a client, converts the client Prisma already generates. Its types don't record database names or native types, so tables and columns are the model and field names (quote them in SQL, since Postgres folds unquoted names to lower case), and types are the connector's defaults (`DateTime` is `timestamp`). Supply what's missing as overrides:

```ts
import { createSql, type FromPrisma } from "@typesql/prisma";
import { postgres } from "@typesql/core/postgres";
import type { Prisma } from "./generated/prisma/client";

const sql = createSql(postgres, prisma);
sql('SELECT id, "createdAt" FROM "User" WHERE role = $1', "ADMIN");

type DB = FromPrisma<Prisma.TypeMap, {
  User: {
    $table: "users";
    name: { column: "display_name" };
    email: "varchar";
    updatedAt: { default: false };
  };
  Account: { $schema: "auth" };
}>;
```

`FromPrisma` treats every field that is optional in Prisma's create input as having a default, client-side defaults and `@updatedAt` included. Mark those `{ default: false }`, or use the generator.

Prisma Client's types don't record `@map` on enum values or `@@map` on an enum either. So `FromPrisma` names an enum type after the Prisma enum and types it with the Prisma value names, while `$queryRaw` returns the database values. With mapped values, list the database values under `$types`, keyed by the Prisma enum name (`$types: { Role: "ADMIN" | "super_user" }`), or use the generator, which reads both from the schema. A cast to the mapped enum name (`'x'::role_kind`) needs the generator.

The generator also keeps `Unsupported("…")` fields, which Prisma Client leaves out, as columns of that type (`Unsupported("tsvector")` is `tsvector`).

## SQLite

All three packages also convert SQLite schemas. Pass `sqlite` instead of `postgres`, and the schema is typed with SQLite's type names and the [SQLite dialect](./sqlite)'s rules:

```ts
import { sqlite } from "@typesql/core/sqlite";
import { createSql } from "@typesql/kysely"; // or @typesql/drizzle, @typesql/prisma

const sql = createSql(sqlite, db);
const rows = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();
```

Statements are sent through the ORM as for PostgreSQL. Since some SQLite drivers only bind positional parameters, `$1`, `$2`, … are rewritten to `?` with the values in order. `sql.json(value)` is bound as JSON text.

| Kysely | Drizzle (`sqlite-core`) | Prisma | SQLite type |
|---|---|---|---|
| `number` | `numeric` | | `numeric` |
| `bigint` | `integer` (every `mode`) | `Int` | `integer` |
| | | `BigInt` | `bigint` |
| | `real` | `Float` | `real` |
| | | `Decimal` | `decimal` |
| `string` | `text` | `String` | `text` |
| a union of string literals | `text({ enum })` | an enum | `Typed<"text", …>`, typed as the literals |
| `boolean` | | `Boolean` | `boolean` |
| `Date` | | `DateTime` | `datetime` |
| `Uint8Array`, `Buffer` | `blob` (every `mode`) | `Bytes` | `blob` |
| objects, arrays | `text({ mode: "json" })` | | `Typed<"json", T>`, with typed JSON paths |
| | | `Json` | `jsonb` |
| `unknown` | `customType` | | `any` (Kysely's `unknown`: `Typed<"json", {}>`) |

- **Kysely**: `number` can't say whether a column is `INTEGER` or `REAL`, so it is `numeric`; rows are `number` either way. Pin a column with an override (`{ posts: { id: "integer" } }`), as for PostgreSQL. `KyselySqliteSql` and `FromKyselySqlite` are the SQLite counterparts of `KyselySql` and `FromKysely`.
- **Drizzle**: rows are what the driver returns, so an `integer({ mode: "boolean" })` column is `0` or `1` and a `timestamp` column is a number. `generatedAlwaysAs()` columns can't be written; `$defaultFn()` columns have no database default. `createSql(sqlite, db)` works with every Drizzle SQLite driver; on better-sqlite3 and bun:sqlite, `sql.transaction(fn)` runs `BEGIN` / `COMMIT` itself, since their Drizzle transactions can't await, and on the async drivers it uses `db.transaction(fn)`. With `drizzle-orm/sqlite-proxy`, return rows as objects for `all`, since TypeSQL reads columns by name. Pin a type with `sqliteType(builder, "text")`.
- **Prisma**: the `typesql-prisma` generator writes a SQLite schema when the datasource provider is `sqlite`, importing from `@typesql/core/sqlite`. Rows are typed with `PrismaSqliteTypeMap`, which follows what Prisma's SQLite adapters return from `$queryRaw`: `DATETIME` columns are `Date`, `BIGINT` is `bigint`, `DECIMAL` is `Decimal`, `BOOLEAN` is `boolean` and `Json` columns are parsed. A computed column has no declared type, so Prisma returns its raw value: `max(created_at)` is a string, not a `Date`, and computed integers (`count(*)`, `1 + 1`, `length(email)`, `max(id)`) are `bigint`, although they are typed `number`. Cast them in SQL (`CAST(count(*) AS REAL)`) or convert them with `Number()`. `FromPrismaSqlite` converts `Prisma.TypeMap` without the generator.
