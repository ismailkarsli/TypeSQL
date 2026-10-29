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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2cAvnAGZQQhwBEAAjAJ5hoDOhA9ANaOtoGMaAbgBQoSLEQiAkExZwAwhAIBXEADsAKszQAaGXLRwA4mnVooWNABN90gNK9+jOwAUIrGAHN0rACLAGARoyDD6pBRUtDx8AsJi4NDwSO7KJOSU1DRgXvEihnAAkuowABxwALyKympaOgA8Mp5QwOpedgBGwF6t8AA+cOpqHRZwA82t7TJdPSVjg8Oj4zAtbSIAfKIFmqBsMBjgldWqGtos9X5WunCX2PMTbde3RsurXpv5OnAAshAQ1kcaAALDBgMCCeY0VgYax5XoWMgYZBGPwAISk0hUfCgrAAXBjpMBrPjTOZLNhrPUhiARlAPtJpGgQBhgAR8Q8vKIGSA-sSfrz5kMCAQudJUJgKQB9LAkswWKyUnYgPYHMD04hcyCePEEomyskK+rFMr06QYFQwIHQSV6hY0iyimDAGDBdkrSaisAqDoEYCsIE2fXyin1Dp-YIYdTq0TEEQiZAQdSeODWDpHcwAdzgjlijAuqPWAAoEDJrIFgqF8Zm4O5PD42AEgiEYMW4JBlFW0FnUgRCwBKEh98J90QJpPwdhEKriqz4Aj5oupkdxsfJ6yWMgwVhHDAZlnwVMyAB0sWbADFMoXsh4tzQ+8fT6FCwBtGhEmjXGhOl1oGgAXXvaQjwzAN0CvL0fT9ANYU-CoP3III+EAo80AADxCC00H7UR40TZMI2sCwwwwKAASqSdCxkAADHAAFEABlaIUTQ4BUFDmVZa42J5f5rgTFQSkLMAjyJAcAEEcDbG9WH0OA5PkhTFKU5T5MsdQuH7OAAHkADVaIAJTgQstP0vwDLgVEAE0UAgASW2E0SblonAFHEySwAIJE0BEFTfOUs99K075WOxbcVDgRizxYgApLTCgAOSk7U220xLhPNS1rSJI42OysT4r8Nsjwg31-RsHy-MquSAHUAAkDNo1ijx4si4AAEgARgqqq-OMQKAFVXAs6zcusKi7GBUFwQ-ERl1XeA1K4Gwdz3Z04AIoiIBI6wUPQ5BMOwuNd33FMOiPFZI2hUJgETftdow7BCwwVhGHUZAjJWVCBwqdYMWOtbPpkICVDAawrE0DAfSw69tTvIGTzQFskBKqDAzgFYVCMYhAKAkCLGhjKrSgG0YNoODrg6nH7v2x7lzNVb4BnbA5wXQtPr7SiGSoszGM0RqAqCpKtzgOqGrgQmstazq4Hywr4q0liUbKsa7GkDq7D7amDuXbGcIomiGKYljsoF4KsQsbdRf0xqWqOTrxtoSMfEEZcgA) <span data-playground="kysely"></span>.

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

const sql = createSql<DB>(db);

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
| `Json`, `JSONColumnType<T>`, other objects | `jsonb` (always nullable, because codegen's `JsonValue` includes `null`) |
| `T[]`, `ArrayType<T>` | element type `[]` |
| a union of string literals (codegen enums) | an enum, registered in `$types` |
| `T \| null` | nullable |
| `Generated<T>`, `GeneratedAlways<T>` | has a default: optional in `INSERT` (no other column has one) |
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
	await createSql<DB>(trx)(
		"DELETE FROM posts WHERE author_id = $1 AND NOT published",
		1,
	).execute();
});
```

Queries run through `db.withoutPlugins()`, so logging, the dialect and the pool apply, but result transformers such as `CamelCasePlugin` don't. Kysely's `PostgresDialect` runs on `pg`: for the exact `pg` types (`Buffer` for `bytea`, interval objects), use `createSql<DB, PgTypeMap>(db)`.

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
>(db);

sql("SELECT avg(score) FROM posts");
sqlx("SELECT avg(score) FROM posts");
```

- An override is a type name (`"float8"`) or a partial descriptor: `{ type?, nullable?, hasDefault? }`. Use `{ nullable: false }` for a JSON column `INSERT` must set, and `{ hasDefault: true }` for a column with a database default that isn't `Generated`.
- `{ $view: true }` marks a table as a view, so writes to it are rejected.
- Without `$types`, each enum column gets its own name (`users.mood`), so a `UNION` of two such columns is an error.

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

const camel = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>(
	camelDb,
);
camel("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1);
```

For camelCase rows, as `CamelCasePlugin` would return them, also pass `{ rowKeys: "camelCase" }`. Only top-level keys are renamed, not keys inside JSON values. See [camelCase row keys](./queries#camelcase-row-keys).

```ts
const camelRows = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>(
	camelDb,
	{ rowKeys: "camelCase" },
);
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
import type * as schema from "./orm-drizzle-schema.js";

const sql = createSql<typeof schema>(db);

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

`createSql<typeof schema>(db)` runs queries on the driver client under `db`: the `Pool`, `Client` or postgres.js `sql` you passed to `drizzle()`, or the transaction's connection inside `db.transaction(fn)`. Pass the driver's type map as the second type argument:

```ts
import type { PgTypeMap } from "@typesql/pg";

const pgSql = createSql<typeof schema, PgTypeMap>(db);
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
	await createSql<typeof schema, PgTypeMap>(tx)(
		"DELETE FROM posts WHERE author_id = $1",
		1,
	).execute();
});
```

Rows are what the driver returns: Drizzle's column mappers and logger are not involved. Only node-postgres and postgres.js databases are supported.

::: warning postgres.js dates
`drizzle-orm/postgres-js` turns off postgres.js' date parsers on its client. On that driver, `date`, `timestamp`, `timestamptz` and `interval` come back as strings, so use a type map that says so.
:::

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
>(db);
```

Enums are found by matching an exported `pgEnum`. Name the export after the SQL type (`export const mood = pgEnum("mood", …)`) so casts like `'happy'::mood` resolve. A column whose enum isn't exported is `text`.

The other gaps (generated-always columns, `$onUpdate`, `.$type<T>()`, `text({ enum })`) are listed in [Limits](./limits#orm-schemas).

## Prisma

```sh
npm install @typesql/core @typesql/prisma
```

`@prisma/client` 7 or later is a peer dependency. Only the `postgresql` provider is supported. [Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQUIgNwAoUJFgY4iqCmooAynMKS0ABSjApISgCVKAdyy5gZeLwFDRE5BRZBTBbe0p1DS1SGig+SkU0ABEAIQwNAEgmKQopAC50jIzgWgKScioaWgAeEWAYgBYRAD5NIpQHYFwCnFxagDdKKEUACyGWtozaOzA2RAB9UkoQFALmVg4uWpoADxgJzIzBLjKyCmMakUc8VVbDpjBaC4BBGB68bdAgmGWwA4zuG1IFIYPlCsVStgPiImEwSv8MpQmDARtB5iV3n06o0ETBgDATlCsbt9nciv1PC4weVzlVavUYAAOf6AzIAEksYPQh2uhJEzySAFkAJIMERwAA+ogAqiYAKKOSIAzTcKK0FCKNiGfQQUgguChOwOAo2I1OVzuTwxTTKPXwYJwAC8+kMxjMfVSzQAFIbwgBKTQaW36yi0ED1KROuCuSj4uDBL2ZAAG8oAMnKsAAVOAlQjTKSzSgLJYrQgwx4vfZwABijgA8oK4NlcnAAOoACQVcrgxzQzrZAEYk-hMvyhaKRCO-QA6FA7DXIlBegNRYP2n6gqMxuMJ5NpjPZpEotG5nVMGJegBUfrgzxMBogIKkhCkTBAXopKCpN7vcE-VJretG2BTciHraUrDgFIAE1o2RVEoHRWhhw0Gc5wXGhl0DNc4HVLgqi3FxY3tORpxgKg9QSPFdS9L0YB2G9HWaTJ6K9JMkjldNM27WsGwfJ8207RxuyPBCkKjQdhzgAc0PnRRFxwc8YGXKdAwTJNRXlRxs1FTM634zcvVEk96AQfEuBvAA1Z5U2lOV7y9QdCDZAAmP0pIHMt2xQVgIBEFcgA) <span data-playground="prisma"></span>.

Prisma Client's types leave out the database names and native types, so `@typesql/prisma` has a generator that writes the exact schema. Add it to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` interface with the database's own names (`@map`, `@@map`), native types (`@db.*`), database defaults, enums and `@@schema` namespaces:

```ts
import type { Col, Nullable, Generated } from "@typesql/core";

export interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"varchar">;
		display_name: Nullable<"text">;
		role: Generated<"Role">;
		updatedAt: Col<"timestamp">;
	};
	posts: {
		id: Col<"uuid">;
		author_id: Col<"int4">;
		title: Col<"text">;
		views: Generated<"int8">;
	};
	$types: {
		Role: "ADMIN" | "USER" | "guest";
	};
}
```

```ts
import { createSql } from "@typesql/prisma";

const sql = createSql<DB>(prisma);

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
    $table: "users";
    name: { column: "display_name" };
    email: "varchar";
    updatedAt: { default: false };
  };
  Account: { $schema: "auth" };
}>;
```

`FromPrisma` treats every field that is optional in Prisma's create input as having a default, client-side defaults and `@updatedAt` included. Mark those `{ default: false }`, or use the generator.
