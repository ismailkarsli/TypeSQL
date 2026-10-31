# @typesql/pg

## 1.1.0

### Patch Changes

- `@typesql/core`, `@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`, `@typesql/sqlite` and `@typesql/cli` now share one version number and are released together: install them all at the same version.

- Updated dependencies:
  - @typesql/core@1.1.0

## 0.4.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@1.0.1

## 0.4.2

### Patch Changes

- Write generated schema columns as Col<type, { nullable: true; hasDefault: true }> instead of the removed Nullable, Generated and NullableGenerated helpers.

- Update the README Playground examples to write columns with Col options instead of the removed Nullable and Generated helpers.

- Updated dependencies:
  - @typesql/core@1.0.0

## 0.4.1

### Patch Changes

- Improve typesql CLI errors: show the causes of a refused localhost connection instead of an empty message, reject a malformed --url, add --version, show introspect options for typesql introspect --help, resolve a config file's out against the config file, reject config files with unknown options or no default export, and silence the stripTypeScriptTypes experimental warning.

- Parse node-postgres arrays of enums, domains and extension types such as citext, which pg returns as raw {…} strings, so they match their array types.

- Mark an introspected UNION/INTERSECT/EXCEPT view column NOT NULL only when every branch is, instead of looking at the first branch alone.

- Fix the README Playground links, which opened with module resolution that ignores package exports and showed no TypeSQL errors or types.

- Label PostgreSQL 18 VIRTUAL generated columns as VIRTUAL in introspected JSDoc, and fail with a clear message instead of writing an invalid file when a relation or schema is named $types or $functions.

- Stop a dropped connection inside sql.transaction() on a Pool from crashing the process with an unhandled 'error' event; the transaction now rejects and the pool discards the client.

- Updated dependencies:
  - @typesql/core@0.10.1

## 0.4.0

### Minor Changes

- Replace rowKeys options with CasePlugin on SQL instances.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.10.0

## 0.3.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.2

## 0.3.2

### Patch Changes

- Reads current catalog metadata for view nullability without retaining introspection results.

- Updated dependencies:
  - @typesql/core@0.9.1

## 0.3.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.0

## 0.3.0

### Minor Changes

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.8.1
