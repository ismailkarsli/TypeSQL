# @typesql/cli

The `typesql` command runs tracked schema migrations and introspects databases. Requires Node.js 26 or newer. `typesql introspect` reads a PostgreSQL or SQLite database and writes its [TypeSQL](https://www.npmjs.com/package/@typesql/core) schema to a TypeScript file.

## Install

```sh
npm install -D @typesql/cli
npm install -D pg   # for PostgreSQL
```

## Usage

```sh
npx typesql introspect --url postgres://localhost/app --out src/db/schema.ts
npx typesql introspect --dialect sqlite --db app.db --out src/db/schema.ts
```

`--dialect` is `postgres` (the default) or `sqlite` (the default when `--db` is given). `typesql introspect --dialect <name> --help` lists the options of each dialect.

## Tracked migrations

Create `typesql.config.ts` in your working directory:

```ts
import type { MigrationConfig } from "@typesql/cli";

export default {
  dialect: "postgres",
  migrationsDir: "./migrations",
} satisfies MigrationConfig;
```

For SQLite, use `{ dialect: "sqlite", db: "./app.db" }`. The default directory is `migrations` beside the config file. Configured database and migration paths are relative to the config file; `--db` and `--dir` paths are relative to the working directory.

```sh
npx typesql migrate make "create users"
npx typesql migrate up       # one pending migration
npx typesql migrate latest   # every pending migration
npx typesql migrate down     # one applied migration
npx typesql migrate generate # write db.ts from the migrations
```

`make` writes `<unix-seconds>_<name>.ts`, converting spaces to dashes and linking the new file's schema type to the previous `up` export. It refuses duplicate filenames and names that sort before existing files. Every `.ts` file is read in filename order, including manually named files.

```ts
import type { PostgresMigration, MigrationSchema } from "@typesql/core/migration";

export async function up(db: PostgresMigration) {
  const next = await db.add("CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL)");
  await next("INSERT INTO users (name) VALUES ($1)", "Ada").execute();
  return next;
}

export async function down(db: PostgresMigration<MigrationSchema<typeof up>>) {
  await db.add("DROP TABLE users");
}
```

Use `SqliteMigration` for SQLite. `up` returns its final context, including for a no-op migration. `down` is required but may have an empty body. Await `.add()` and `.raw<NewSchema>()`; retain each returned context in a new `const` to carry its changed schema. Query calls return checked queries with `.execute()` and inferred rows. The first migration may supply an existing schema type as its context's type argument.

`--config <file>` selects another config; `--dialect`, `--url`, `--db`, and `--dir` override it. PostgreSQL uses `DATABASE_URL` when no URL is configured. Complete flags work without a config file:

```sh
npx typesql migrate latest --dialect sqlite --db app.db --dir migrations
```

Applied filenames, normalized runtime-code SHA-256 hashes, and timestamps are recorded in `schema_migrations`; set `migrationTable` in config to change its name. Changing runtime code in an applied file, deleting one, or inserting a file before an applied migration causes an error. Comments, formatting, and erased TypeScript types do not change hashes; runtime token spelling does.

Each migration and its history update run in their own transaction. Earlier successful migrations remain committed if `latest` later fails. PostgreSQL holds a session advisory lock for the command; SQLite uses `BEGIN IMMEDIATE` and checks history again in each transaction. SQL that cannot run in a transaction fails. An empty `down` still removes its history record.

`up`, `down`, and `latest` then write the schema of the last applied migration to `db.ts` beside the config, as `export interface DB` with `Col` and `View` types. `npx typesql migrate generate` writes the schema of the last migration file without connecting. The schema is read from the migrations' types with TypeScript, so each `up` must be typed and return its context. Set `schemaFile` or pass `--out` to change the path; set `generate: false` or pass `--no-generate` to skip writing after a migration.

Successful and empty operations exit with code 0, configuration or execution failures with 1, and invalid command syntax with 2. Progress is written to stdout and errors to stderr.

## Documentation

- [From a live database](https://typesql.karsli.net/guide/introspect): PostgreSQL options
- [SQLite](https://typesql.karsli.net/adapters/sqlite#generate-the-schema): SQLite options

## License

[MIT](LICENSE)
