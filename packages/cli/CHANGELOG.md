# @typesql/cli

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
