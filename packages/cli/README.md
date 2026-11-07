# @typesql/cli

The `typesql` command runs schema migrations, introspects databases and formats the SQL of TypeSQL calls. Requires Node.js 26 or newer. `typesql introspect` reads a PostgreSQL, SQLite, MySQL or MariaDB database and writes its [TypeSQL](https://www.npmjs.com/package/@typesql/core) schema to a TypeScript file.

## Install

```sh
pnpm add -D @typesql/cli
pnpm add -D pg       # for PostgreSQL
pnpm add -D mysql2   # for MySQL and MariaDB
pnpm add @typesql/core   # for migrations
```

Migration files and the generated `db.ts` import from `@typesql/core`, so migrations need it as a dependency of your project; with pnpm, the CLI's own copy isn't importable from your files.

## Usage

```sh
pnpm exec typesql introspect --url postgres://localhost/app --out src/db/schema.ts
pnpm exec typesql introspect --dialect sqlite --db app.db --out src/db/schema.ts
pnpm exec typesql introspect --url mysql://root:pw@localhost:3306/app --out src/db/schema.ts
pnpm exec typesql introspect --url mariadb://root:pw@localhost:3306/app --out src/db/schema.ts
```

`--dialect` is `postgres` (the default), `sqlite` (the default when `--db` is given), `mysql` (the default for `mysql://` URLs) or `mariadb` (the default for `mariadb://` URLs). MySQL and MariaDB schemas import their helpers from `@typesql/core/mysql`. `typesql introspect --dialect <name> --help` lists the options of each dialect.

## Migrations

Create `typesql.config.ts` in your working directory. It default-exports a migrator from `@typesql/core/migration`:

```ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
  dialect: "postgres",
  url: process.env.DATABASE_URL,
  migrationsDir: "./migrations",
});
```

For SQLite, use `{ dialect: "sqlite", db: "./app.db", migrationsDir: "./migrations" }`; for MySQL or MariaDB, `{ dialect: "mysql", url: "mysql://user:password@host:3306/app", migrationsDir: "./migrations" }` or `dialect: "mariadb"`, with the database in the URL. MySQL and MariaDB connect with `mysql2`, which accepts `mysql://` and `mariadb://` URLs. Relative paths in the config resolve beside the config file.

```sh
pnpm exec typesql migrate make "create users"
pnpm exec typesql migrate up       # the next pending migration
pnpm exec typesql migrate latest   # every pending migration
pnpm exec typesql migrate down     # the last applied migration
pnpm exec typesql migrate status   # applied and pending migrations
pnpm exec typesql migrate generate # write db.ts from the migrations
```

`make` writes `<unix-seconds>_<name>.ts`, converting spaces to dashes, starting from the previous file. It refuses duplicate filenames and names that sort before existing files. Every `.ts` file runs in filename order, including manually named files. Each file default-exports its migration:

```ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js";

export default migration(previous, {
  up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
  down: async (db) => {
    await db.ddl("ALTER TABLE users DROP COLUMN bio");
  },
});
```

The first file starts from `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"` instead of `previous`. `up` returns its final context; await each `.ddl()` and keep the context it returns. Files written for TypeSQL 3.x, which export `up` and `down` functions, still run.

`--config <file>` selects another config, and `--dialect`, `--url`, `--db`, `--dir`, `--out` and `--no-generate` override it, with paths relative to the working directory. PostgreSQL, MySQL and MariaDB use `$DATABASE_URL` when nothing else sets a connection. Without a config file, pass `--dialect` and `--url` or `--db`; the directory is then `./migrations`:

```sh
pnpm exec typesql migrate latest --dialect sqlite --db app.db
```

The history is recorded in `schema_migrations` (`migrationTable` changes the name). Each migration and its history row commit together in their own transaction; PostgreSQL takes a transaction-scoped advisory lock, SQLite uses `BEGIN IMMEDIATE`, and MySQL and MariaDB hold a `GET_LOCK` named lock. The history is checked under the lock before each migration. MySQL and MariaDB commit implicitly before and after each DDL statement, so a failing migration keeps the DDL that already ran; its data changes since the last DDL statement roll back and no history row is written. Removing or renaming an applied migration, or inserting or reordering one before it, is an error. Applied migrations are tracked by name only: editing their DDL is not detected, so add a new migration to change the database.

`up`, `down` and `latest` then write the schema of the last applied migration to `db.ts` beside the config. `generate` writes the schema of the last migration file without connecting. Writing it needs `typescript` 7.1 or later; set `schemaFile` or pass `--out` to change the path, and set `generate: false` or pass `--no-generate` to skip it.

The command exits with 0 on success, 1 on configuration, connection or migration errors, and 2 on invalid usage. If only `db.ts` can't be written after a successful migration, it warns and exits with 0; fix the cause and run `pnpm exec typesql migrate generate`. Progress goes to stdout and errors to stderr.

## Formatting

```sh
pnpm exec typesql format           # every file of ./tsconfig.json and the projects it references
pnpm exec typesql format src/db    # the project's files under src/db
pnpm exec typesql format --check   # write nothing; exit with 1 if a file would change
```

`typesql format` writes the keywords of the SQL that TypeSQL checks in one case, tidies the spaces between its tokens and lays out its lines: the SQL goes on one line if it fits within 80 columns, and otherwise on a clause per line, with an item or condition per line in a clause that is still too long. SQL that leaves one line goes into a template literal. TypeScript's types find that SQL: the string argument of every call whose parameter TypeSQL types as SQL, such as `sql()`, `sql.fragment()`, `sql.prepare()` and a migration's `db.ddl()`, whatever the variable is named. Names, types, functions, strings and comments stay as written, and so does the text of an unaliased select item in SQLite, MySQL and MariaDB, which name the column after it. It needs `typescript` 7.1 or later.

Keywords are upper case unless the config sets `format: { keywordCase: "lower" }`; `--keyword-case upper|lower` overrides it. `format: { width }` or `--width <columns>` sets the width of a line, 80 by default. `--project <file>` reads another `tsconfig.json` and `--config <file>` another config.

## Documentation

- [From migrations](https://typesql.karsli.net/guide/migrations): migration files, the config and `typesql migrate`
- [From a live database](https://typesql.karsli.net/guide/introspect): PostgreSQL options
- [SQLite](https://typesql.karsli.net/adapters/sqlite#generate-the-schema): SQLite options
- [MySQL and MariaDB](https://typesql.karsli.net/adapters/mysql#generate-the-schema): MySQL and MariaDB options
- [Formatting SQL](https://typesql.karsli.net/guide/format): `typesql format`

## License

[MIT](LICENSE)
