# @typesql/cli

## 7.1.0

### Patch Changes

- `main(argv, io)` writes the output of `typesql introspect` through `io`, as it does for `typesql migrate`, instead of to the process's stdout and stderr.

- `typesql introspect` without `--dialect` or `--url` reads MySQL or MariaDB when `DATABASE_URL` is a `mysql://` or `mariadb://` URL, as for `--url`, instead of connecting to it as PostgreSQL.

- Updated dependencies:
  - @typesql/core@7.1.0
  - @typesql/mysql@7.1.0
  - @typesql/pg@7.1.0
  - @typesql/sqlite@7.1.0

## 7.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.0.1
  - @typesql/mysql@7.0.1
  - @typesql/pg@7.0.1
  - @typesql/sqlite@7.0.1

## 7.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.0.0
  - @typesql/mysql@7.0.0
  - @typesql/pg@7.0.0
  - @typesql/sqlite@7.0.0

## 6.2.0

### Minor Changes

- `typesql introspect` and `typesql migrate` accept `--dialect mysql` and `--dialect mariadb`. A `mysql://` or `mariadb://` URL selects the dialect by itself, and `DATABASE_URL` is the default URL for MySQL and MariaDB as it is for PostgreSQL. The schema file written after a migration uses `Enum` and `Typed` where the schema has them.

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.2.0
  - @typesql/mysql@6.2.0
  - @typesql/pg@6.2.0
  - @typesql/sqlite@6.2.0

## 6.1.4

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.1.4
  - @typesql/pg@6.1.4
  - @typesql/sqlite@6.1.4

## 6.1.3

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

- Updated dependencies:
  - @typesql/core@6.1.3
  - @typesql/pg@6.1.3
  - @typesql/sqlite@6.1.3

## 6.1.2

### Patch Changes

- Internal type-safety cleanup with no change in behavior.

- Updated dependencies:
  - @typesql/core@6.1.2
  - @typesql/pg@6.1.2
  - @typesql/sqlite@6.1.2

## 6.1.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.1.1
  - @typesql/pg@6.1.1
  - @typesql/sqlite@6.1.1

## 6.1.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.1.0
  - @typesql/pg@6.1.0
  - @typesql/sqlite@6.1.0

## 6.0.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.3
  - @typesql/pg@6.0.3
  - @typesql/sqlite@6.0.3

## 6.0.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.2
  - @typesql/pg@6.0.2
  - @typesql/sqlite@6.0.2

## 6.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.1
  - @typesql/pg@6.0.1
  - @typesql/sqlite@6.0.1

## 6.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.0
  - @typesql/pg@6.0.0
  - @typesql/sqlite@6.0.0

## 5.0.4

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.4
  - @typesql/pg@5.0.4
  - @typesql/sqlite@5.0.4

## 5.0.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.3
  - @typesql/pg@5.0.3
  - @typesql/sqlite@5.0.3

## 5.0.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.2
  - @typesql/pg@5.0.2
  - @typesql/sqlite@5.0.2

## 5.0.1

### Patch Changes

- The documentation reflects migration tracking and locking, supported driver and editor versions, and the current query APIs.

- Updated dependencies:
  - @typesql/core@5.0.1
  - @typesql/pg@5.0.1
  - @typesql/sqlite@5.0.1

## 5.0.0

### Patch Changes

- The README shows migrations with `db.ddl(…)`, the new name of `db.add(…)`.

- Updated dependencies:
  - @typesql/core@5.0.0
  - @typesql/pg@5.0.0
  - @typesql/sqlite@5.0.0

## 4.0.1

### Patch Changes

- Standardize installation instructions on pnpm and document packaged consumer validation.

- Build packages with the updated TypeScript toolchain and dependency type definitions.

- Updated dependencies:
  - @typesql/core@4.0.1
  - @typesql/pg@4.0.1
  - @typesql/sqlite@4.0.1

## 4.0.0

### Major Changes

- `typesql migrate` runs the migrator that `typesql.config.ts` default-exports (`export default createMigrator({ … })` from `@typesql/core/migration`; a plain config object is an error), with the flags applied over it; `typesql migrate status` lists applied and pending migrations, `make` writes `export default migration(previous, { up, down })`, and the `MigrationConfig` type is removed.

### Patch Changes

- Write `db.ts` for migration histories of any length: `typesql migrate generate`, and the schema file written after `up`, `down` and `latest`, read each migration after the files it imports, so a history of 29 or more migrations no longer writes a garbage schema such as `"__@ERR@…": { toString: …; charAt: … }` or fails with "up's return type is untyped". A schema TypeScript could not compute (an error type, `never`, or a type error from a wrong statement) is now an error naming the migration, and nothing is written.

- Exit with 0 when `typesql migrate up`, `down` or `latest` succeeds but the schema file can't be written, printing a warning to run `typesql migrate generate` instead of turning the applied migration into a failure on every later run. When the migrations can't import `@typesql/core/migration`, as with pnpm when `@typesql/core` is not a dependency of the project, the error says so and how to add it, and `typesql migrate make` warns about it.

- Updated dependencies:
  - @typesql/core@4.0.0
  - @typesql/pg@4.0.0
  - @typesql/sqlite@4.0.0

## 3.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@3.0.0
  - @typesql/pg@3.0.0
  - @typesql/sqlite@3.0.0

## 2.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@2.0.1
  - @typesql/pg@2.0.1
  - @typesql/sqlite@2.0.1

## 2.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@2.0.0
  - @typesql/pg@2.0.0
  - @typesql/sqlite@2.0.0

## 1.1.0

### Patch Changes

- `@typesql/core`, `@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`, `@typesql/sqlite` and `@typesql/cli` now share one version number and are released together: install them all at the same version.

- Updated dependencies:
  - @typesql/core@1.1.0
  - @typesql/pg@1.1.0
  - @typesql/sqlite@1.1.0

## 0.2.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@1.0.1
  - @typesql/pg@0.4.3
  - @typesql/sqlite@0.1.3

## 0.2.0

### Minor Changes

- Add typesql migrate generate, which writes the schema of the last migration to db.ts, and write it after migrate up, down and latest unless --no-generate or generate: false is set; schemaFile and --out change the path.

### Patch Changes

- Updated dependencies:
  - @typesql/core@1.0.0
  - @typesql/pg@0.4.2
  - @typesql/sqlite@0.1.2

## 0.1.4

### Patch Changes

- Improve typesql CLI errors: show the causes of a refused localhost connection instead of an empty message, reject a malformed --url, add --version, show introspect options for typesql introspect --help, resolve a config file's out against the config file, reject config files with unknown options or no default export, and silence the stripTypeScriptTypes experimental warning.

- Accept TypeScript 7.1 prereleases such as 7.1.0-beta in the peer range, and load TypeScript only when typesql migrate hashes a migration file, so --help works without it.

- Updated dependencies:
  - @typesql/core@0.10.1
  - @typesql/pg@0.4.1
  - @typesql/sqlite@0.1.1

## 0.1.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.10.0
  - @typesql/pg@0.4.0
  - @typesql/sqlite@0.1.0

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.2
  - @typesql/pg@0.3.3
  - @typesql/sqlite@0.0.4

## 0.1.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.1
  - @typesql/pg@0.3.2
  - @typesql/sqlite@0.0.3

## 0.1.0

### Minor Changes

- Create and run tracked TypeScript migrations with migrate make, up, down, and latest commands and project configuration.

### Patch Changes

- Parse CLI routing options with Node's standard argument parser and respect option terminators.

- Updated dependencies:
  - @typesql/core@0.9.0
  - @typesql/pg@0.3.1
  - @typesql/sqlite@0.0.2

## 0.0.1

### Patch Changes

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.

- Updated dependencies:
  - @typesql/pg@0.3.0
