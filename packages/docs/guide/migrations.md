---
description: "Derive the TypeSQL schema from checked DDL migrations, and run them with createMigrator or the typesql migrate command."
---

# From migrations

If you already write DDL to create your database, TypeSQL can read the schema from it. Each migration runs checked DDL, and the schema it leaves is a type: a wrong statement is a compile error, and the schema after the last migration is the `DB` your queries use. `createMigrator()` runs the migrations and records which ones ran, from a directory of files or from an array, with the `typesql migrate` command or from your own code.

## Define a migration

`migration(from, { up, down })`, from `@typesql/core/migration`, defines one migration:

::: code-group

```ts [PostgreSQL]
import { migration } from "@typesql/core/migration";

export const createUsers = migration("postgres", {
	name: "create-users",
	up: async (db) => {
		const users = await db.ddl(`CREATE TABLE users (
			id serial PRIMARY KEY,
			email text NOT NULL UNIQUE,
			display_name text
		)`);
		await users("INSERT INTO users (email) VALUES ($1)", "ada@example.com").execute();
		return users;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});

export const addBio = migration(createUsers, {
	name: "add-bio",
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [SQLite]
import { migration } from "@typesql/core/migration";

export const createUsers = migration("sqlite", {
	name: "create-users",
	up: async (db) => {
		const users = await db.ddl(`CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			display_name TEXT
		)`);
		await users("INSERT INTO users (email) VALUES ($1)", "ada@example.com").execute();
		return users;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});

export const addBio = migration(createUsers, {
	name: "add-bio",
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [MySQL]
import { migration } from "@typesql/core/migration";

export const createUsers = migration("mysql", {
	name: "create-users",
	up: async (db) => {
		const users = await db.ddl(`CREATE TABLE users (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			email VARCHAR(255) NOT NULL UNIQUE,
			display_name VARCHAR(255)
		)`);
		await users("INSERT INTO users (email) VALUES ($1)", "ada@example.com").execute();
		return users;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});

export const addBio = migration(createUsers, {
	name: "add-bio",
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

:::

- `name` is the migration's name in the [history](#tracking). A migration in an [array](#an-array) needs one; a [migration file](#a-directory-of-files) is named by its file name and leaves it out.
- `from` is `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"` for the first migration, which starts from an empty schema of that dialect, and the previous migration for a later one.
- `up`'s `db` starts from the schema `from` leaves. `down`'s `db` starts from what `up` returns.
- Await `db.ddl(ddl)`: it runs the statement and returns a new context with the changed schema. Keep it in a new `const`; reassigning a variable doesn't change its type. A wrong statement is a compile error on its string, worded like the database's error: `relation "users" already exists`, `column "age" of relation "users" does not exist`, and so on. One `.ddl()` may hold a `;`-separated script, which may also seed data: its `SELECT`, `INSERT`, `UPDATE` and `DELETE` statements are checked against the schema at that point, without changing it. For parameters or result rows, call the context instead (below). `.add()` is a deprecated alias of `.ddl()`; use `.ddl()` in new code.
- `up` must return its final context; a no-op `up` returns `db`. If it doesn't, passing its migration to the next `migration()` is a compile error.
- `down` is required, may be empty, and need not restore the earlier schema type.
- Calling the context runs a checked query, as with `sql`: `users("…", …)` returns a query with `.execute()` and inferred rows.
- `.raw<NewSchema>(sql)` runs SQL the type checker can't see (dynamic or unsupported statements) and returns a context with the schema you state; without a type argument the schema stays the same.
- The runner owns the transaction, so a migration that sends `BEGIN`, `COMMIT` or `ROLLBACK` fails (`ROLLBACK TO` a savepoint is fine). Await every query and `.ddl()` before `up` or `down` returns; the context rejects statements after its migration has finished.

Each migration's starting schema is inferred from `from` as a function argument, not computed by a type alias, so checking a migration costs the same however many come before it. A history of any length type-checks, in the editor and with `tsc`.

`SchemaOf<typeof m>` is the schema after the migration `m`. Pass it to `createSql`:

::: code-group

```ts [PostgreSQL]
import type { SchemaOf } from "@typesql/core/migration";
import { createSql } from "@typesql/pg";

type DB = SchemaOf<typeof addBio>;
const sql = createSql<DB>(pool);
const q = sql(`SELECT id, display_name, bio FROM users WHERE email = ${sql.param("a@b.c")}`);
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import type { SchemaOf } from "@typesql/core/migration";
import { createSql } from "@typesql/sqlite";

type DB = SchemaOf<typeof addBio>;
const sql = createSql<DB>(new DatabaseSync("app.db"));
const q = sql(`SELECT id, display_name, bio FROM users WHERE email = ${sql.param("a@b.c")}`);
```

```ts [MySQL]
import { createPool } from "mysql2/promise";
import type { SchemaOf } from "@typesql/core/migration";
import { createSql } from "@typesql/mysql";

type DB = SchemaOf<typeof addBio>;
const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
const q = sql(`SELECT id, display_name, bio FROM users WHERE email = ${sql.param("a@b.c")}`);
```

:::

`SchemaOf` is also exported from `@typesql/core`. A migration that starts from `"sqlite"` is checked with [SQLite's rules](../adapters/sqlite#schema), and one that starts from `"mysql"` or `"mariadb"` with [MySQL's](../adapters/mysql#migrations); the two differ only where the servers do.

### Starting from an existing schema

`migration()` always starts the first migration from an empty schema. If the database already has tables that no migration creates, type the first migration's `db` yourself, with `PostgresMigration<Existing>`, `SqliteMigration<Existing>`, `MySqlMigration<Existing>` or `MariaDbMigration<Existing>` from `@typesql/core/migration`, where `Existing` is the schema (for example one written by [`typesql introspect`](./introspect)):

::: code-group

```ts [PostgreSQL]
import { migration, type PostgresMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: PostgresMigration<Existing>) => db,
	down: async () => {},
};

export const addBio = migration(baseline, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [SQLite]
import { migration, type SqliteMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: SqliteMigration<Existing>) => db,
	down: async () => {},
};

export const addBio = migration(baseline, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [MySQL]
import { migration, type MySqlMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: MySqlMigration<Existing>) => db,
	down: async () => {},
};

export const addBio = migration(baseline, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

:::

In a directory, the same first migration is a file that exports `up` and `down` functions: `export async function up(db: PostgresMigration<Existing>) { return db; }`.

## A directory or an array

The migrator takes the migrations in one of two ways. Both write the same history table, so a project can move from one to the other.

### A directory of files

With `migrationsDir`, every `.ts` file in the directory (not `.d.ts`) is a migration, run in filename order. Each file default-exports its migration, and a later file imports the one before it:

::: code-group

```ts [PostgreSQL]
// migrations/1793356800_create-users.ts
import { migration } from "@typesql/core/migration";

export default migration("postgres", {
	up: async (db) =>
		db.ddl("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)"),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
```

```ts [SQLite]
// migrations/1793356800_create-users.ts
import { migration } from "@typesql/core/migration";

export default migration("sqlite", {
	up: async (db) =>
		db.ddl("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)"),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
```

```ts [MySQL]
// migrations/1793356800_create-users.ts
import { migration } from "@typesql/core/migration";

export default migration("mysql", {
	up: async (db) =>
		db.ddl("CREATE TABLE users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL)"),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
```

:::

::: code-group

```ts [PostgreSQL]
// migrations/1793360400_add-bio.ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js";

export default migration(previous, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [SQLite]
// migrations/1793360400_add-bio.ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js";

export default migration(previous, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

```ts [MySQL]
// migrations/1793360400_add-bio.ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js";

export default migration(previous, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio TEXT"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

:::

Import the previous file as `.js`: TypeScript resolves it to the `.ts` file without `allowImportingTsExtensions`, and the migrator loads the `.ts` file for it. [`typesql migrate make`](#the-typesql-migrate-command) writes new files with this template. The files are imported with Node's type stripping, so directory mode needs Node.js 26 or newer. Application code imports the schema from the generated [DB file](#the-db-file).

Files written for TypeSQL 3.x, which export `up` and `down` functions, still load; see [Upgrading](./upgrading#_4-0).

### An array

With `migrations`, the migrations are values you pass in order, usually from one module:

::: code-group

```ts [PostgreSQL]
import { createMigrator } from "@typesql/core/migration";
import { addBio, createUsers } from "./migrations.js";

const migrator = createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [createUsers, addBio],
});
```

```ts [SQLite]
import { createMigrator } from "@typesql/core/migration";
import { addBio, createUsers } from "./migrations.js";

const migrator = createMigrator({
	dialect: "sqlite",
	db: "./app.db",
	migrations: [createUsers, addBio],
});
```

```ts [MySQL]
import { createMigrator } from "@typesql/core/migration";
import { addBio, createUsers } from "./migrations.js";

const migrator = createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrations: [createUsers, addBio],
});
```

:::

Each migration needs a `name`, unique in the array, which the history records it by. Each must start from the one before it in the array, and the first one from the migrator's dialect; the migrator checks this before it connects, so a misordered array fails without touching the database. The schema is `SchemaOf<typeof addBio>` of the last migration: there is no generated file, and the type checker infers the chain where the schema is used. The migrator carries it too: `SchemaOf<typeof migrator>`, or `SchemaOf<typeof result>` of what `latest()` returns. Array mode needs no file system, so it also runs [outside Node](#runtimes).

### Moving between them

The history records each migration by its name: the file name in directory mode, and its `name` in array mode. So a database migrated from a directory can continue from an array whose migrations are named after the files (`name: "1793356800_create-users.ts"`), in the same order, and the other way round.

## The migrator

`createMigrator(config)` returns a migrator. It checks the config but never connects, so importing a module that creates one has no side effects.

::: code-group

```ts [PostgreSQL]
import { createMigrator } from "@typesql/core/migration";

const migrator = createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});

const { applied } = await migrator.latest();
```

```ts [SQLite]
import { createMigrator } from "@typesql/core/migration";

const migrator = createMigrator({
	dialect: "sqlite",
	db: "./app.db",
	migrationsDir: "./migrations",
});

const { applied } = await migrator.latest();
```

```ts [MySQL]
import { createMigrator } from "@typesql/core/migration";

const migrator = createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});

const { applied } = await migrator.latest();
```

:::

| Method | Does | Returns |
|---|---|---|
| `latest()` | applies every pending migration | `Promise<LatestResult<Schema>>`: `{ applied, schemaFile?, schemaError? }` |
| `up()` | applies the next pending migration | `Promise<UpResult>`: the same fields |
| `down()` | reverts the last applied migration | `Promise<DownResult>`: `{ reverted, schemaFile?, schemaError? }` |
| `status()` | lists every migration, applied or pending | `Promise<MigrationStatus[]>`: `{ name, applied, appliedAt: Date \| null }` |
| `make(name)` | creates a migration file (directory mode) | `Promise<string>`: the file's path |
| `generate()` | writes the [DB file](#the-db-file) (directory mode) | `Promise<string>`: the file's path |
| `with(overrides)` | a new migrator with some config replaced | `Migrator` |

- `Schema` is the schema after the last migration: inferred from the `migrations` array, or given in directory mode as `createMigrator<DB>({ … })`, with `DB` from the DB file. The array must keep its order in its type: write it in the call, or declare it with `as const`. A variable such as `const all = [m1, m2]` has the type `(typeof m1 | typeof m2)[]`, with no last migration, so passing it is a type error unless the schema is given: `createMigrator<SchemaOf<typeof m2>>({ … })`. A config typed `MigratorConfig` is accepted, with the schema `unknown`. `SchemaOf<typeof result>` of the result of `latest()`, and `SchemaOf<typeof migrator>`, are that schema; it is a type only, not a property at runtime.
- `applied` and `reverted` are the history names of the migrations that ran, in order; they are empty when there was nothing to do.
- In directory mode, `latest()`, `up()` and `down()` then write the DB file: `schemaFile` is its path. If it can't be written, they still resolve, with `schemaError`: the database is migrated, only the file is not.
- A migration that fails rejects the call with a `MigrationError`. Its message names the migration and gives the database's error, which is also its `cause`. `migration` is the name of the one that failed, and `rolledBack` tells whether the migrator rolled it back: not with `transaction: false`, nor when its statements didn't run in its transaction or the connection was lost (the server then ends the transaction itself); the message says so when it may be partly applied. `applied` lists the ones the call applied before it; those stay applied, and in directory mode the DB file is written for them, with `schemaFile` or `schemaError` as above. The CLI prints them before the error.
- `status()` lists the migrations in order. An applied one has the name from its history row and `appliedAt` from `applied_at`.
- `make()` and `generate()` throw in array mode. `generate()` first checks the chain as the commands do, so files that start from another dialect, or out of order, are an error and the DB file is not written.
- `.config` is the migrator's config. `isMigrator(value)` tells whether a value is a migrator, from any copy of `@typesql/core`.

### Config

| Option | Meaning |
|---|---|
| `dialect` | `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"` |
| `url` | PostgreSQL, MySQL and MariaDB: a connection URL (`mysql://user:password@host:3306/db` names the database). The migrator connects with `pg` or `mysql2`, optional peer dependencies of `@typesql/core`: install the one you use |
| `db` | SQLite: a database file, opened with `node:sqlite` |
| `execute` | your own connection: an [executor](../adapters/custom-executor#write-an-executor), used for every call and never closed |
| `migrationsDir` | a directory of migration files |
| `migrations` | the migrations, in order |
| `migrationTable` | the history table; default `schema_migrations` |
| `schemaFile` | directory mode: where the DB file is written; default `db.ts` |
| `generate` | directory mode: write the DB file after `latest()`, `up()` and `down()`; default `true` |
| `transaction` | run each migration in a transaction and lock the history; default `true`. See [Transactions and locking](#transactions-and-locking) |

Set exactly one of `migrationsDir` and `migrations`, and at most one of `url`, `db` and `execute`. `url` goes with `postgres`, `mysql` and `mariadb` (`mysql://` and `mariadb://` URLs both work for the last two) and `db` with `sqlite`. Relative paths resolve against the working directory (the command resolves those of its config file beside the file).

With `url` or `db`, each method call opens one connection, runs all its migrations on it, one after another, and closes it. With `execute`, every statement runs on your executor, so give it one dedicated connection, not a pool: `BEGIN` and `COMMIT` must reach the same session. After each `BEGIN`, and before each `COMMIT`, the migrator checks that the executor's next call is still in that transaction, and fails before anything runs when it isn't. Prisma, a Kysely on a pool and libsql's client send each call to any connection: with Kysely, run the migrator inside `db.connection().execute((connection) => …)` with `executor(connection)`; with Prisma, give it `url`; with libsql, set `transaction: false`. Each adapter's `executor(client)` builds an executor, and uses SQLite's placeholders when the client is on SQLite:

::: code-group

```ts [PostgreSQL]
import { Client } from "pg";
import { executor } from "@typesql/pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	await migrator.with({ execute: executor(client) }).latest();
} finally {
	await client.end();
}
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import { executor } from "@typesql/sqlite";

const database = new DatabaseSync("app.db");
try {
	await migrator.with({ execute: executor(database) }).latest();
} finally {
	database.close();
}
```

```ts [MySQL]
import { createConnection } from "mysql2/promise";
import { executor } from "@typesql/mysql";

const connection = await createConnection(process.env.DATABASE_URL!);
try {
	await migrator.with({ execute: executor(connection) }).latest();
} finally {
	await connection.end();
}
```

:::

On PostgreSQL the migrator sends each `.ddl()` and `.raw()` text as one call without values, and node-postgres and postgres.js run every statement of a `;`-separated script. On SQLite, where a prepared statement runs only the first, it sends each statement of the script as a call of its own, and so on MySQL and MariaDB.

`with(overrides)` returns a new migrator. Giving one of `url`, `db` and `execute` replaces the others, and giving `migrationsDir` or `migrations` replaces the other one; `undefined` values are ignored.

## The `typesql migrate` command

`@typesql/cli` runs a migrator from the command line. It needs Node.js 26 or newer. Install it with `@typesql/core`, and `pg` for PostgreSQL or `mysql2` for MySQL and MariaDB:

::: code-group

```sh [PostgreSQL]
pnpm add @typesql/core
pnpm add -D @typesql/cli pg
```

```sh [SQLite]
pnpm add @typesql/core
pnpm add -D @typesql/cli
```

```sh [MySQL]
pnpm add @typesql/core
pnpm add -D @typesql/cli mysql2
```

:::

Migration files and the generated `db.ts` import from `@typesql/core`, so it must be a dependency of your project itself. `@typesql/cli` depends on it too, but pnpm doesn't let your files import a dependency's dependencies; without it, `typesql migrate make` warns, and running a migration fails with `Cannot find package '@typesql/core'`.

The config file, `typesql.config.ts` in the working directory, default-exports a migrator:

::: code-group

```ts [PostgreSQL]
// typesql.config.ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});
```

```ts [SQLite]
// typesql.config.ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
	dialect: "sqlite",
	db: "./app.db",
	migrationsDir: "./migrations",
});
```

```ts [MySQL]
// typesql.config.ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});
```

:::

A plain config object is an error. Relative paths in the config (`migrationsDir`, `schemaFile`, `db`) resolve beside the config file, and `schemaFile` defaults to `db.ts` beside it. An array config can import its migrations as TypeScript does, `import { all } from "./migrations.js"` for `migrations.ts`: Node loads the config with type stripping, and the command maps a relative `.js` import of a `.ts` file outside `node_modules` to the `.ts` file when there is no `.js` one.

```sh
pnpm exec typesql migrate make "create users"   # create a migration file
pnpm exec typesql migrate latest                # apply every pending migration
pnpm exec typesql migrate up                    # apply the next one
pnpm exec typesql migrate down                  # revert the last applied one
pnpm exec typesql migrate status                # list applied and pending migrations
pnpm exec typesql migrate generate              # write db.ts, without a database
```

| Flag | Does |
|---|---|
| `--config <file>` | the config module; default `./typesql.config.ts` |
| `--dialect <name>` | `postgres`, `sqlite`, `mysql` or `mariadb` |
| `--url <url>` | PostgreSQL, MySQL or MariaDB URL; default `$DATABASE_URL` when neither the config nor a flag sets a connection |
| `--db <file>` | SQLite database file |
| `--dir <directory>` | migrations directory |
| `--out <file>` | the DB file to write |
| `--no-generate` | don't write the DB file after `latest`, `up` or `down` |

Flags override the config (through `with()`), and their paths resolve against the working directory. Without a config file, pass `--dialect` and `--url` or `--db`; the directory is then `./migrations` and the DB file `./db.ts`:

```sh
pnpm exec typesql migrate latest --dialect sqlite --db app.db
```

`make <name>` writes `<unix-seconds>_<name>.ts`, with spaces turned into dashes. It refuses an existing filename and a name that would sort before the last file. The new file starts from the last one:

```ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js";

export default migration(previous, {
	up: async (db) => {
		return db;
	},
	down: async (db) => {},
});
```

The first file starts from `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"`, and a file after a 3.x file imports its `up`: `import { up as previous } from "./….js"`.

`status` prints one line per migration: `applied` or `pending`, the time it was applied, and its name.

The command exits with 0 on success, also when there was nothing to do and when only the DB file could not be written after a migration (it prints a warning; fix the cause and run `typesql migrate generate`). Configuration, connection and migration errors exit with 1, and invalid usage with 2. Progress goes to stdout and errors to stderr.

## Tracking

The history table has three columns: `name` (the primary key), `hash` and `applied_at`. `hash` is unused and left empty; TypeSQL 3.x stored a hash of each file there, and the column stays so 3.x tables keep working. The migrator creates the table when it is missing; on PostgreSQL it is in the connection's current schema, and on MySQL and MariaDB in the connection's database. Rows are read in the order they were applied (`ORDER BY applied_at, name`); the migrator writes strictly increasing `applied_at` values so that two migrations applied in the same second keep their order.

Each database command (`latest()`, `up()`, `down()` and `status()`):

1. Checks the chain: each migration must start from the one before it, and the first one from the dialect. This happens before it connects.
2. Reads the history. The applied rows must be the first migrations, in order, by name, so these are errors that name the migration:
   - an applied migration that was removed or renamed: `applied migration 2 (add-bio) is not among the migrations: it was removed or renamed`;
   - a migration added before applied ones, or a changed order: `migration 2 (add-email) is not applied, but migration 3 (add-bio) after it is`.
3. Applies or reverts migrations one at a time: runs `up`, then inserts its row, in the same transaction (`down` deletes the row).

A new file sorts after the applied ones when its name starts with a later timestamp, as `typesql migrate make` writes them.

### Changing an applied migration {#rewriting-an-applied-migration}

The migrator doesn't notice an applied migration's code changing: it records names, not contents. Editing its DDL changes the schema type your code is checked against, but not the databases it was applied to. Leave applied migrations as they are and add a new migration that makes the change. Changing code that has no effect on the database, such as a query rewritten for a new TypeSQL version, a reformatted statement or types, is fine.

## Transactions and locking

By default (`transaction: true`) each migration and its history row commit together, in their own transaction. A failure rolls back that migration; the ones before it stay applied.

- **PostgreSQL** takes an advisory lock (`pg_advisory_xact_lock`) at the start of each migration's transaction, keyed by the database, schema and history table, and reads the history again after it, so concurrent runs apply each migration once, though their migrations may interleave. The lock ends with the transaction, so it is never left held on a pooled connection. Statements that can't run in a transaction block (`CREATE INDEX CONCURRENTLY`, `VACUUM`) fail. After `ALTER TYPE … ADD VALUE`, the new label can't be used until a later migration.
- **SQLite** starts each migration with `BEGIN IMMEDIATE` and reads the history again after taking the write lock, so concurrent runs apply each migration once, though their migrations may interleave. `db` waits up to 30 seconds for another writer.
- **MySQL and MariaDB** hold a `GET_LOCK` named lock for the run. They commit implicitly before and after every DDL statement (`CREATE`, `ALTER`, `DROP`, …), so a migration that fails can't be rolled back as a whole: the DDL that already ran stays applied, while the data changes since its last DDL statement roll back and no history row is written. The `MigrationError` then reports `rolledBack: false`; fix the database by hand, or write migrations whose statements can run again, before retrying.

With `transaction: false`, the migrator sends no `BEGIN` or `COMMIT` and takes no lock. Use it only where the database or client doesn't support them (Cloudflare D1, libsql's client), or to apply a single migration that can't run in a transaction: `migrator.with({ transaction: false }).up()`. It is not safe for concurrent runs, and a migration that fails partway leaves its earlier statements applied and no history row, so fix the database before running it again.

## Runtimes

`@typesql/core/migration` imports no Node built-ins when it loads. The Node-only parts load when they are used: reading a directory, connecting from `url` (`pg` or `mysql2`) or `db` (`node:sqlite`), `make()` and `generate()`. So array mode with `execute` runs in Cloudflare Workers, Bun and Deno.

Bundlers (esbuild, `bun build`, Wrangler) include the Node-only parts, which reach Node's built-ins through `process.getBuiltinModule()` and so leave a Worker bundle nothing to resolve. A Node bundle runs `url`, `db` and `migrationsDir` as unbundled code does, but `pg`, `mysql2` and `typescript` (for `generate()`) are not bundled: they load from `node_modules` at runtime, so install them beside the bundle.

Cloudflare D1 doesn't accept `BEGIN` and `COMMIT`, so set `transaction: false`:

```ts
import { positional } from "@typesql/core/adapter";
import { createMigrator } from "@typesql/core/migration";
import { addBio, createUsers } from "./migrations.js";

export const migrator = (env: { DB: D1Database }) =>
	createMigrator({
		dialect: "sqlite",
		migrations: [createUsers, addBio],
		transaction: false,
		execute: async (text, values) => {
			const query = positional(text, values);
			return (await env.DB.prepare(query.text).bind(...query.values).all())
				.results;
		},
	});

// in a handler: await migrator(env).latest();
```

The migrator's statements and TypeSQL's queries use `$1`, `$2`, …, which D1 doesn't bind. `positional(text, values)`, from `@typesql/core/adapter`, rewrites them to `?` with the values in order, and converts values as for SQLite (`true` to `1`, `sql.json()` to JSON text). D1's `prepare` takes one statement; the migrator sends each statement of an `.ddl()` or `.raw()` on its own. Without a lock, run migrations from one place at a time, such as a deploy step.

## The DB file

In directory mode, `latest()`, `up()` and `down()` end by writing the schema after the last applied migration to `schemaFile` (with the command, `db.ts` beside the config):

```sh
pnpm exec typesql migrate generate   # the schema after the last migration file, without a database
```

::: code-group

```ts [PostgreSQL]
// Generated by `typesql migrate generate` from 1793356800_create-users.ts. Do not edit.
import type { Col } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"text">;
	};
}
```

```ts [SQLite]
// Generated by `typesql migrate generate` from 1793356800_create-users.ts. Do not edit.
import type { Col } from "@typesql/core/sqlite";

export interface DB {
	users: {
		id: Col<"integer", { hasDefault: true; position: 0; rowid: true }>;
		email: Col<"text", { position: 1 }>;
	};
}
```

```ts [MySQL]
// Generated by `typesql migrate generate` from 1793356800_create-users.ts. Do not edit.
import type { Col } from "@typesql/core/mysql";

export interface DB {
	users: {
		id: Col<"int unsigned", { autoIncrement: true; position: 0 }>;
		email: Col<"varchar", { position: 1 }>;
	};
}
```

:::

Import `DB` in application code instead of `SchemaOf<typeof …>`, so the type checker doesn't infer the migrations there.

- The file is read from the migrations' types with TypeScript, using the nearest `tsconfig.json`, so it needs `typescript` 7.1 or later where the migrator runs. Running migrations doesn't otherwise need it: in a production install without `typescript`, set `generate: false` or pass `--no-generate`.
- It reads the migrations one at a time, each file's imports before the file, so the length of the history doesn't matter.
- A migration whose `up` doesn't return its context is an error, and so is a schema TypeScript could not compute (an error type, or a type error from a wrong statement): run `tsc` on the migrations to see why. Nothing is written then.
- After `down` reverts the first migration, the file holds that migration's starting schema.
- `schemaFile` or `--out` changes the path. `generate: false` or `--no-generate` turns off writing after `latest`, `up` and `down`.

In array mode there is no DB file; use `SchemaOf<typeof last>` or `SchemaOf<typeof migrator>`.

## `ApplyDdl`

`ApplyDdl<DB, "…">`, from `@typesql/core/postgres`, `@typesql/core/sqlite` or `@typesql/core/mysql`, is the type behind `.ddl()`. It returns the schema after one DDL statement, or after a `;`-separated script:

::: code-group

```ts [PostgreSQL]
interface Before {
	users: { id: Col<"int4", { hasDefault: true }>; email: Col<"text"> };
}
type After = ApplyDdl<
	Before,
	"ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0; ALTER TABLE users RENAME COLUMN email TO login"
>;
```

```ts [SQLite]
interface Before {
	users: { id: Col<"integer", { hasDefault: true }>; email: Col<"text"> };
}
type After = ApplyDdl<
	Before,
	"ALTER TABLE users ADD COLUMN age INTEGER NOT NULL DEFAULT 0; ALTER TABLE users RENAME COLUMN email TO login"
>;
```

```ts [MySQL]
interface Before {
	users: { id: Col<"int unsigned", { autoIncrement: true }>; email: Col<"varchar"> };
}
type After = ApplyDdl<
	Before,
	"ALTER TABLE users ADD COLUMN age INT NOT NULL DEFAULT 0; ALTER TABLE users RENAME COLUMN email TO login"
>;
```

:::

## What is supported

- **Schema changes:** `CREATE` / `ALTER` / `DROP` of tables, views (also materialized), enums and schemas, plus `CREATE FUNCTION`, whose return type goes into `$functions`.
- **Checked without a schema change:** `SELECT`, `INSERT`, `UPDATE` and `DELETE`.
- **Skipped:** indexes, sequences, triggers, extensions, grants and other statements.
- **Columns:** `NOT NULL`, `PRIMARY KEY`, `serial` and identity columns are non-null; `DEFAULT`, `serial`, identity and generated columns are optional in `INSERT`; views keep the nullability their query infers.

This list is PostgreSQL's; what MySQL and MariaDB DDL does to the schema is in [MySQL and MariaDB](../adapters/mysql#migrations).

Known gaps:

- Dependencies aren't tracked: dropping a column a view uses is accepted.
- The kind of default isn't recorded, so writing to a `GENERATED ALWAYS` column is accepted.
- `search_path` is ignored, and composite types and domains map to `unknown` unless the type map knows them.
