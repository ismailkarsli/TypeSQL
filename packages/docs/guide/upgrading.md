# Upgrading

This page lists every breaking change since the first 0.x releases, newest first, with the code to change. Start at the section for the version you are on and work up: from 3.x apply [4.0](#_4-0); from 2.x apply [3.0](#_3-0), then 4.0; from 1.x apply [2.0](#_2-0), then 3.0 and 4.0; from 0.x start at [Upgrading from 0.x](#upgrading-from-0-x). The [changelog](/changelog) has the release notes from 1.0.0 on.

Most breaking changes are compile errors at the call site, so after upgrading run `tsc --noEmit` (or your editor) and work through the list. The changes that compile but behave differently are marked **Runtime change**.

## Before you upgrade

- **One version for the library packages.** Since 1.1.0, `@typesql/core`, `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma` and `@typesql/cli` share one version and are released together. Upgrade them together, to the same version:

  ```sh
  npm install @typesql/core@4 @typesql/pg@4   # and any other @typesql/* package you use
  ```

  Before 1.1.0 the adapters had their own 0.x versions (for example `@typesql/pg` 0.4.3 went with `@typesql/core` 1.0.1). `@typesql/language-server` and the VS Code extension keep their own versions.

- **TypeScript 7.1 or later.** Required since `@typesql/core` 0.2.0 and declared as a peer dependency. See [Installation](./installation#requirements).

- **tsconfig requirements.** TypeSQL needs `strictNullChecks`, which `strict: true` turns on. Without it, TypeScript removes `null` and `undefined` from every type, so a nullable column would look like a `NOT NULL` one and an optional value like a required one; TypeSQL reports a compile error instead of giving such types. If your project can't turn on `strict` yet, set `"strictNullChecks": true` on its own:

  ```json
  {
    "compilerOptions": {
      "strictNullChecks": true
    }
  }
  ```

## 4.0

### One migrator for every way of running migrations

4.0 replaces the migration APIs with two functions from `@typesql/core/migration`: `migration(from, { up, down })` defines a migration, and `createMigrator(config)` runs a directory of migration files or an array of migrations, and records them in a history table. The untracked `migrations()` builder and the adapters' `migrate(db, m)` are removed; an array of migrations replaces them. See [From migrations](./migrations).

| 3.x | 4.0 |
|---|---|
| `migrations()` of `@typesql/core/postgres` or `/sqlite`, and its `.add()` chain | `migration("postgres", { up, down })` (or `"sqlite"`), with the statements awaited in `up` |
| `migrations<Existing>()` | a first migration whose `up` takes `PostgresMigration<Existing>`; see [Starting from an existing schema](./migrations#starting-from-an-existing-schema) |
| `SchemaOf<typeof m>` of a builder | `SchemaOf<typeof last>` of the last migration (`@typesql/core` or `@typesql/core/migration`) |
| `m.statements` | no replacement: the migrator runs `up` |
| `migrate(db, m)` of `@typesql/pg`, `@typesql/postgres` and `@typesql/sqlite`; `runMigrations(client, m)` of `@typesql/core` | `createMigrator({ dialect, migrations: [...], url \| db \| execute }).latest()` |
| `migrateLatest(options)`, `migrateUp(options)`, `migrateDown(options)` | `createMigrator(config).latest()`, `.up()`, `.down()` |
| `MigrationOptions` (`{ dialect, migrationsDir, execute, migrationTable? }`) | `MigratorConfig`: the same fields, plus `url`, `db`, `migrations`, `schemaFile`, `generate` and `transaction` |
| `MigrationResult` (`{ direction, migrations }`) | `LatestResult` and `UpResult` (`{ applied }`) and `DownResult` (`{ reverted }`), with `schemaFile` or `schemaError` in directory mode |
| `discoverMigrations(dir)`, `MigrationFile`, `MigrationModule` | `createMigrator(config).status()`, which lists the migrations and whether they are applied |
| `migrationHash(source)` | no replacement: migrations are tracked by a [fingerprint](./migrations#the-fingerprint) |
| `MigrationSchema<typeof up>` | `SchemaOf<typeof up>` |
| `Migrations`, `PgMigrations`, `SqliteMigrations`, `MigrationClient`, `MigrationSource` | `Migration` |
| `MigrationConfig` of `@typesql/cli` (a config object) | `export default createMigrator({ … })` in `typesql.config.ts` |

`ApplyDdl` and `ValidateDdl` stay in `@typesql/core/postgres` and `@typesql/core/sqlite`.

A builder becomes an array of migrations:

```ts
// 3.x
import type { SchemaOf } from "@typesql/core";
import { migrations } from "@typesql/core/postgres";
import { migrate } from "@typesql/pg";

export const m = migrations()
	.add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
	.add("ALTER TABLE users ADD COLUMN bio text");
export type DB = SchemaOf<typeof m>;

await migrate(pool, m);

// 4.0
import { createMigrator, migration, type SchemaOf } from "@typesql/core/migration";

export const createUsers = migration("postgres", {
	up: async (db) =>
		db.add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)"),
	down: async (db) => {
		await db.add("DROP TABLE users");
	},
});
export const addBio = migration(createUsers, {
	up: async (db) => db.add("ALTER TABLE users ADD COLUMN bio text"),
	down: async (db) => {
		await db.add("ALTER TABLE users DROP COLUMN bio");
	},
});
export type DB = SchemaOf<typeof addBio>;

await createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [createUsers, addBio],
}).latest();
```

**Runtime change.** The builder ran every statement each time; the migrator runs only the migrations its history table doesn't list. On a database the builder already migrated, the history is empty, so `latest()` runs every migration again and fails on the first table that exists. Make the first migration's statements safe to rerun (`CREATE TABLE IF NOT EXISTS`), or begin the history with a migration that [starts from the existing schema](./migrations#starting-from-an-existing-schema).

`url` connects with `pg`, now an optional peer dependency of `@typesql/core`; install it to use `url`. Running migrations no longer needs `typescript`; only writing `db.ts` does.

### The `typesql migrate` config file default-exports a migrator

```ts
// 3.x
import type { MigrationConfig } from "@typesql/cli";

export default {
	dialect: "postgres",
	migrationsDir: "./migrations",
} satisfies MigrationConfig;

// 4.0
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});
```

A plain object is now an error. The flags, the `$DATABASE_URL` fallback, the paths beside the config file and the exit codes are unchanged; `typesql migrate status` is new. See [The `typesql migrate` command](./migrations#the-typesql-migrate-command).

### 3.x migration files and history tables

The history table keeps its columns (`name`, `hash`, `applied_at`), so it needs no schema change. 3.x stored a hash of each file's source; 4.0 stores a fingerprint of what `up` runs. The first 4.0 command in directory mode, `status` included, converts the table: each row with a 3.x hash is matched to the file of the same name and gets that file's fingerprint, in the same transaction. This trusts that the applied files are the ones 3.x last checked, so run 3.x's `typesql migrate latest` once before upgrading (it checks every applied file) and upgrade without editing the files in between. A 3.x row without a file of its name is an error. In array mode, a 3.x history is an error: run one command in directory mode first, then switch.

3.x files, which export `up` and `down` functions, still load in directory mode, so applied ones need no rewrite. `MigrationSchema` is removed; replace it with `SchemaOf`, which takes a 3.x `up` too:

```ts
// 3.x
import type { MigrationSchema, PostgresMigration } from "@typesql/core/migration";
import type { up as previousUp } from "./1793356800_create-users.ts";

export async function up(db: PostgresMigration<MigrationSchema<typeof previousUp>>) {

// 4.0
import type { PostgresMigration, SchemaOf } from "@typesql/core/migration";
import type { up as previousUp } from "./1793356800_create-users.ts";

export async function up(db: PostgresMigration<SchemaOf<typeof previousUp>>) {
```

New files use the default-export form. `typesql migrate make` writes it, and after a 3.x file it imports that file's `up`: `import { up as previous } from "./1793356800_create-users.js"`.

Because the fingerprint covers what `up` runs and not its source, an applied 3.x file can also be rewritten to `export default migration(previous, { up, down })` after the conversion: as long as `up` runs the same `.add()` and `.raw()` steps, it still matches. A 3.x file that follows a rewritten one imports its default export instead of its `up` (`import type previous from "./….ts"` and `SchemaOf<typeof previous>`). Rewriting also fixes a long 3.x history whose later files report false type errors in the editor.

## 3.0

### `{name}` slots are now `${fragment}`

Fragments and queries are interpolated straight into the SQL template. `{name}` slots and the slot-map argument are removed from `sql()`, `sql.prepare()`, `sql.as()` and `sql.fragment()`, and from the query calls of a migration context.

```ts
// 2.x
const where = sql.fragment("WHERE p.author_id = $1", 7);
const q = sql("SELECT p.id, p.title FROM posts p {where} ORDER BY p.id LIMIT $1", { where }, 10);
const prolific = sql("SELECT email FROM users WHERE id IN ({authors})", { authors });
const find = sql.prepare("SELECT id FROM users u {filter}", { filter });

// 3.0
const where = sql.fragment("WHERE p.author_id = $1", 7);
const q = sql(`SELECT p.id, p.title FROM posts p ${where} ORDER BY p.id LIMIT $1`, 10);
const prolific = sql(`SELECT email FROM users WHERE id IN (${authors})`);
const find = sql.prepare(`SELECT id FROM users u ${filter}`);
```

The rewrite, for each call the compiler flags:

1. Turn the SQL string into a template literal: change its quotes to backticks. If the SQL already contains a backtick or `${`, escape it (`` \` ``, `\${`).
2. Replace each `{name}` with `${value}`, where `value` is what the slot map held under `name` (`{ where }` holds `where`; `{ w: byAuthor }` holds `byAuthor`).
3. Delete the slot-map argument. The arguments after it (`$n` values or the `:name` object) stay as they are.

The statement is still checked with the fragment spliced in. A union of fragments (`${flag ? a : b}`) is checked once per member, as a slot holding a union was. A `{name}` left in the SQL is now a syntax error, so the compiler finds any you missed; braces inside string literals, such as `'{1,2}'::int[]`, are not slots and stay as they are. See [Dynamic SQL](./dynamic-sql).

Update the [VS Code extension](./vscode) to 1.0 or later and `@typesql/language-server` to 0.0.10 or later: they no longer color `{name}` as a slot, and complete columns after a `${…}` table in `FROM`.

### Tracked migrations that use `{name}` slots {#tracked-migrations-with-slots}

::: warning Applied migration files
A tracked migration file that uses `{name}` slots no longer compiles. In 3.x, rewriting it as above changes the file's runtime code, and so its hash, and the next `typesql migrate` command fails with `Applied migration has changed`; 3.x's `migrationHash` gives the new hash to store in the history table once you have checked that the file runs the same SQL. From 4.0 on, queries are not part of a migration's fingerprint, so the rewrite is not a change; see [Changing an applied migration](./migrations#rewriting-an-applied-migration).
:::

### `sql.empty` is now `sql.optional` and `sql.if`

`sql.empty` is removed. `sql.optional(value)` takes a required argument and turns only `undefined` into an omission (`DEFAULT` in `sql.param()`, a skipped item in `sql.combine`, `sql.and` and `sql.or`, nothing when interpolated as `${…}`). `null` stays SQL `NULL`, as in `sql.set`, `sql.values` and `sql.json`. `sql.empty(value)` turned `null` into an omission too, so write `?? undefined` where you relied on that. `sql.if(value, then)` builds a fragment only for a truthy `value`, with `value` narrowed in `then`.

| 2.x | 3.0 |
|---|---|
| `sql.param(sql.empty)` | `sql.param(sql.optional(undefined))` |
| `sql.param(value ?? sql.empty)`, `sql.param(sql.empty(value))` | `sql.param(sql.optional(value ?? undefined))` (`null` sends `DEFAULT`, as before) |
| `sql.param(value === undefined ? sql.empty : value)` | `sql.param(sql.optional(value))` (`null` sends `NULL`) |
| `maybeFragment ?? sql.empty`, `sql.empty(maybeFragment)` in a list | `sql.optional(maybeFragment ?? undefined)` |
| `cond ? sql.fragment(…) : sql.empty` | `sql.if(cond, () => sql.fragment(…))`, or `sql.optional(cond ? sql.fragment(…) : undefined)` |

```ts
// 2.x
const where = sql.and([
	filters.email === null ? sql.empty : sql.fragment("email = $1", filters.email),
	filters.minId === null ? sql.empty : sql.fragment("id >= $1", filters.minId),
]);

// 3.0
const where = sql.and([
	sql.if(filters.email, (email) => sql.fragment("email = $1", email)),
	sql.optional(
		filters.minId === null ? undefined : sql.fragment("id >= $1", filters.minId),
	),
]);
```

`sql.if` skips every falsy value, including `""`, `0` and `false`; use `sql.optional` where those are real values, as for `minId` above. A fragment or query that can be `null` is a compile error in `sql.optional`, so the compiler points at every place that needs `?? undefined`. An optional fragment can now be interpolated directly: `${sql.optional(maybeFragment)}` splices nothing for `undefined`. See [Optional values](./writing-data#optional-values) and [Optional pieces](./dynamic-sql#optional-pieces).

### Fragments and queries are string types

`Fragment` and `Query` types now include a string type, which is what lets `${fragment}` keep the fragment's type in a template literal. At runtime they are still objects with `text` and `values`. What changes:

- **Runtime change.** A fragment or query passed as a parameter value (`sql("… $1", fragment)`), to `sql.param()` or to `sql.id()` throws, where TypeScript used to reject it. Interpolate it with `${…}` instead.
- A fragment or query is assignable to `string`, so a function that takes `string` accepts one without a compile error. Code that branches on `typeof x === "string"` over `string | Fragment` is narrowed wrongly by TypeScript (at runtime it is `"object"`); test for the object instead, such as `typeof x === "object"`.
- **Runtime change.** `String(fragment)` and `` `${fragment}` `` outside `sql()` give an internal placeholder, not `[object Object]`. Log `fragment.text` (and `fragment.values`).

### `InputContext["table"]` can be `null`

`sql.set(values)` and `sql.values(rows)` can leave out the table: the fragment is then checked against the target of the `UPDATE` or `INSERT` it is interpolated into, and `sql.values` also checks the statement with only the keys every row always sends.

```ts
sql(`UPDATE users SET ${sql.set(patch)} WHERE id = $1`, 7);
sql(`INSERT INTO users ${sql.values(rows)} RETURNING id`);
```

For such a call a plugin's `transformInput` gets `{ kind: "set" | "values", table: null }`, so `InputContext["table"]` is now `string | null`. Only custom plugins that read `context.table` need a change; `CasePlugin` does not read it.

```ts
// 2.x
transformInput(value: unknown, context: InputContext) {
	if (context.kind === "set" || context.kind === "values")
		return encode(value, columnsOf(context.table));
	return value;
}

// 3.0
transformInput(value: unknown, context: InputContext) {
	if (context.kind === "set" || context.kind === "values")
		return encode(value, context.table === null ? undefined : columnsOf(context.table));
	return value;
}
```

See [Plugins](./queries#plugins).

### New compile errors

Comparisons PostgreSQL has no operator for are rejected with PostgreSQL's error, as in `id = email` (`operator does not exist: integer = text`): `=`, `<>`, `<` and the other comparison operators, `IS DISTINCT FROM`, `IN` lists and subqueries, `ANY`/`ALL` subqueries and row comparisons, between numbers, strings, booleans, date/time values, intervals, `uuid` and `bytea` of different kinds. These statements failed on the database before; add the cast PostgreSQL needs (`id::text = email`) or compare the right column. Literals, parameters, enums, arrays and domains are still accepted.

## 2.0

### `sql.json(undefined)` sends `DEFAULT`

`sql.json(undefined)` now sends `DEFAULT` instead of SQL `NULL`, like an omitted `sql.param()`. `sql.json(null)` still sends `NULL`. Where the value can be `undefined`:

- inline, `${sql.json(value)}` is only accepted where `DEFAULT` is (a `VALUES` item or a `SET` value), and is a compile error elsewhere;
- as a positional or named argument it is a compile error, and throws;
- **Runtime change.** In `sql.set` and `sql.values`, the column is left out, as for any `undefined` value: an `UPDATE` no longer sets it to `NULL`, and an `INSERT` uses the column's default.

To keep sending `NULL`, pass `null`:

```ts
declare const settings: { theme: "dark" | "light" } | undefined;

// 1.x: settings === undefined sent NULL
const patch = sql.set("portfolio", { settings: sql.json(settings) });

// 2.0: the same code now leaves the column out; to send NULL:
const patch = sql.set("portfolio", { settings: sql.json(settings ?? null) });
```

Search for `sql.json(` and check each value whose type includes `undefined`; the `sql.set` and `sql.values` cases compile unchanged. See [JSON values](./parameters#json-values).

### Inline values are checked against their full type

Inline `sql.param()` and `sql.json()` values, and the values in fragments, `sql.set` and `sql.values`, are checked against literal and object types: a value that does not fit a `Json<T>` column's `T` or an enum, such as `sql.json({ theme: "blue" })` for `{ theme: "dark" | "light" }`, is an error that names the expected type. A plain `string`, `number` or `boolean` is still checked only for its kind. Fix the value, or the column's `Json<T>` type if it was wrong.

## 1.0

### `Arr`, `Nullable`, `Generated` and `NullableGenerated` are removed

Write columns with `Col` and its options. The helpers were exported from `@typesql/core`, `@typesql/core/postgres` and `@typesql/core/sqlite`; `Col` comes from the same places.

| 0.x | 1.0 |
|---|---|
| `Nullable<"text">` | `Col<"text", { nullable: true }>` |
| `Generated<"int4">` | `Col<"int4", { hasDefault: true }>` |
| `NullableGenerated<"text">` | `Col<"text", { nullable: true; hasDefault: true }>` |
| `Arr<"int4">` | `Col<"int4[]">` |
| `Arr<"text", { nullable: true }>` | `Col<"text[]", { nullable: true }>` |

```ts
// 0.x
import type { Arr, Generated, Nullable } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Generated<"int4">;
		display_name: Nullable<"text">;
		tags: Arr<"text">;
	};
}

// 1.0
import type { Col } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		display_name: Col<"text", { nullable: true }>;
		tags: Col<"text[]">;
	};
}
```

A generated schema is rewritten by running its generator again: `typesql introspect`, `typesql migrate generate` or `prisma generate` with the `typesql-prisma` generator. A hand-written one can be rewritten with a search and replace, in this order, then by fixing the imports:

```sh
sed -i -E \
  -e 's/\bNullableGenerated<("[^"]+")>/Col<\1, { nullable: true; hasDefault: true }>/g' \
  -e 's/\bNullable<("[^"]+")>/Col<\1, { nullable: true }>/g' \
  -e 's/\bGenerated<("[^"]+")>/Col<\1, { hasDefault: true }>/g' \
  -e 's/\bArr<"([^"]+)"/Col<"\1[]"/g' \
  src/schema.ts
```

### `typesql migrate` writes `db.ts`

With `@typesql/cli` 0.2.0 (released with `@typesql/core` 1.0.0), `typesql migrate up`, `down` and `latest` end by writing the schema of the last applied migration to `db.ts` beside the config. Pass `--no-generate`, or set `generate: false` in the config, to keep the old behavior; `schemaFile` or `--out` changes the path. See [The DB file](./migrations#the-db-file).

## Upgrading from 0.x

The 0.x releases changed the API several times. The versions below are `@typesql/core`'s; the adapters' 0.x versions moved with it. Apply the ones newer than the version you are on, then [1.0](#_1-0), [2.0](#_2-0), [3.0](#_3-0) and [4.0](#_4-0).

### 0.10: plugins replace `rowKeys`, `sql.param(undefined)` is rejected

The `rowKeys` option of `createSql` is removed (`@typesql/pg` 0.4, `@typesql/postgres` 0.3, `@typesql/kysely` 0.4, `@typesql/sqlite` 0.1). Attach `CasePlugin`, which also converts camelCase keys in `sql.set` and `sql.values`:

```ts
// 0.9
const sql = createSql<DB>(pool, { rowKeys: "camelCase" });

// 0.10 and later
import { CasePlugin } from "@typesql/core";
const sql = createSql<DB>(pool).withPlugin(new CasePlugin());
```

`@typesql/postgres` keeps its options argument for `bigint`: `createSql<DB>(client, { bigint: true }).withPlugin(new CasePlugin())`. The `Keys` type argument of `Sql` and `TransactionalSql` is now the plugin tuple (`Sql<DB, TM, Plugins>`), the `SqlOptions` and `RowKeys` types are removed, and `@typesql/core/adapter` has `pluginsOf(q)` instead of `rowKeysOf(q)` and `camelCase`. See [camelCase row keys](./queries#camelcase-row-keys).

`sql.param(undefined)` is rejected at compile time and throws, where it sent `DEFAULT`. Write `sql.param(sql.optional(value))` (in 0.10 to 2.x this was `sql.empty`; see [3.0](#sql-empty-is-now-sql-optional-and-sql-if)).

### 0.9: the type cache is removed

The optional type cache (0.2 to 0.9) is gone and queries are always checked directly. Remove the `@typesql/core` entry from `contentMappers` in your tsconfig and delete the `.typesqlcache` file. `--runExternalCode`, and `runExternalCode = true` in Neovim, were only needed for the cache.

### 0.8: dialects, and the `typesql` command moves to `@typesql/cli`

TypeSQL is split into a dialect-neutral core and a PostgreSQL dialect (0.8.0), and SQLite was added (0.8.1). Core's `createSql` takes the dialect first:

```ts
// 0.7
import { createSql, type Json } from "@typesql/core";
const sql = createSql<DB>(executor);

// 0.8 and later
import { createSql } from "@typesql/core";
import { type Json, postgres } from "@typesql/core/postgres";
const sql = createSql<DB>(postgres, executor);
```

- `Json`, `PgCatalog`, `migrations()`, the type maps and the function catalog are imported from `@typesql/core/postgres`, which also re-exports the schema markers. The engine types moved from `@typesql/core/engine` to `@typesql/core/postgres/engine`.
- `@typesql/kysely`, `@typesql/drizzle` and `@typesql/prisma` take the dialect too, and read the schema from the client's type: `createSql(postgres, db)`. `createSql<DB>(postgres, db)` still picks a schema explicitly.
- The driver adapters (`@typesql/pg`, `@typesql/postgres`) are unchanged: `createSql<DB>(pool)`.
- The `typesql` command moved from `@typesql/pg` to `@typesql/cli`: install `@typesql/cli`, and `typesql introspect` reads PostgreSQL by default, or a SQLite file with `--dialect sqlite --db app.db`. `@typesql/pg/introspect` exports the introspection.

### 0.7: `sql.join` is `sql.combine`

```ts
// 0.6
sql.join(items, ", ");

// 0.7 and later
sql.combine(items, { separator: ", " }); // ", " is the default
```

For conditions, use `sql.and(items)` and `sql.or(items)` (1.1 and later) instead of an `" AND "` or `" OR "` separator.

### 0.6: editor completions move to `@typesql/language-server`

`@typesql/core/editor` is removed. Install the [VS Code extension](./vscode), which bundles `@typesql/language-server`, or use `@typesql/language-server` in [Neovim](./neovim).

### 0.5: a smaller public API

- The root export is the user-facing API only. The standalone `param` and `json` are removed (use `sql.param`, `sql.json`), and so are the splice and query-building helpers (`splice`, `renumberParams`, `maxParam`, `quoteIdent`, `joinFragments`, `hasSlots`, `rewriteNamed`, `makeQuery`, `makeFragment`).
- What adapters and custom executors build on moved to `@typesql/core/adapter`: `createTransactionalSql`, `runTransaction`, `SqlDriver`, `mapRows` and `JsonParam`.
- `sql.valueOrDefault(value)` and the standalone `valueOrDefault` are removed; today write `sql.param(sql.optional(value))`.
- `sql.list` is merged into `sql.join` (now `sql.combine`), which throws when there are no items.
- `@typesql/postgres`: `createBigIntSql(client)` is `createSql(client, { bigint: true })`, and `PostgresJsBigIntSql<DB>` is `PostgresJsSql<DB, PostgresJsBigIntTypeMap>`.
- The adapters no longer re-export `NoResultError`, `Executor` and `TransactionalSql` (`@typesql/drizzle` also `Sql`, `Query`, `RowType`, `ParamsType`, `DefaultTypeMap` and `TypeMap`): import them from `@typesql/core`.
- `@typesql/pg/introspect` no longer exports `main`, `ViewNullability` and `parseNodeTree`; `@typesql/prisma/generator` exports only `generateSource`.

### 0.2: TypeScript 7.1

TypeScript 7.1 or later is required, declared as a peer dependency. See [Installation](./installation#install-typescript-7-1).

### 0.1: queries run from `sql`

The adapters' `query`, `one`, `maybeOne`, `many`, `execute`, `transaction` and `RowCountError` exports are removed (`@typesql/pg` and `@typesql/postgres`; `query` and `execute` of `@typesql/kysely`; `queryRaw` and `executeRaw` of `@typesql/prisma`). Bind `sql` to the client and run the query itself:

```ts
// 0.0
const sql = createSql<DB>();
const users = await query(pool, sql("SELECT id, email FROM users"));
const user = await one(pool, sql("SELECT id FROM users WHERE id = $1", 7));
const changed = await execute(pool, sql("UPDATE users SET display_name = NULL"));
await transaction(pool, async (client) => {
	await execute(client, sql("DELETE FROM posts WHERE author_id = $1", 7));
});

// 0.1 and later
const sql = createSql<DB>(pool);
const users = await sql("SELECT id, email FROM users").execute();
const user = await sql("SELECT id FROM users WHERE id = $1", 7).executeTakeFirstOrThrow();
const changed = await sql("UPDATE users SET display_name = NULL").executeCount();
await sql.transaction(async (tx) => {
	await tx("DELETE FROM posts WHERE author_id = $1", 7).execute();
});
```

| 0.0 | 0.1 and later |
|---|---|
| `query(client, q)` | `q.execute()` |
| `one(client, q)` | `q.executeTakeFirstOrThrow()`: throws `NoResultError` on no row, and returns the first of several rows instead of throwing |
| `maybeOne(client, q)` | `q.executeTakeFirst()`: `undefined` instead of `null` for no row, and the first of several rows instead of throwing |
| `many(client, q)` | `q.execute()`, and check `rows.length` |
| `execute(client, q)` | `q.executeCount()` |
| `transaction(pool, (client) => …)` | `sql.transaction((tx) => …)`; `tx.transaction` nests with a savepoint |

`@typesql/drizzle`'s `createSql` takes the Drizzle database or transaction instead of an `Executor`, and has `sql.transaction`. See [node-postgres](../adapters/pg), [postgres.js](../adapters/postgres) and [From Kysely, Drizzle or Prisma](./orms).
