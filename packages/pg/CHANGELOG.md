# @typesql/pg

## 7.6.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.6.0

## 7.5.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.5.0

## 7.4.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.4.1

## 7.4.0

### Minor Changes

- `sql.transaction()` rejects while a transaction is open on the same connection (a pg `Client` or `PoolClient`, a mysql2 or mariadb connection, a postgres.js `ReservedSql`, a SQLite database), including one on the outer `sql` inside a transaction. Before, overlapping calls on PostgreSQL and MySQL shared one transaction, so the first `COMMIT` also committed the second one's writes, and on SQLite they waited in a queue, where one on the outer `sql` never ended. Use `tx` inside a transaction, wait for the other to end, or use a pool. mysql2 and mariadb connections now use their own `beginTransaction()`, `commit()` and `rollback()`. In `@typesql/core/adapter`, `exclusiveTransaction` replaces `serialTransaction`.

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.4.0

## 7.3.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.3.0

## 7.2.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.2.0

## 7.1.0

### Patch Changes

- The introspection `main(argv, io?)` takes an `io` with any of `stdout`, `stderr`, `cwd` and `env`, the process's by default. `typesql introspect` reports a failed connection as `cannot connect to PostgreSQL: …` (or MySQL).

- A script of several statements, such as one passed to `sql.as()`, resolves to its last statement's rows and count, as the migrator's `.raw()` does: node-postgres scripts no longer fail with `Cannot read properties of undefined`, and mysql2 scripts (with `multipleStatements`) no longer return every statement's result as rows.

- `typesql introspect` reads PostgreSQL view plans into objects without a prototype, so a plan field is never confused with an inherited `Object.prototype` member when it infers view column nullability.

- `typesql introspect --type-name`, `generateSource({ typeName })` and the Prisma generator's `typeName` reject a name that is not a TypeScript identifier (`typesql introspect` exits with 2) instead of writing a schema file that does not compile.

- Updated dependencies:
  - @typesql/core@7.1.0

## 7.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.0.1

## 7.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.0.0

## 6.2.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.2.0

## 6.1.4

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.1.4

## 6.1.3

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

- Updated dependencies:
  - @typesql/core@6.1.3

## 6.1.2

### Patch Changes

- The README examples pass values inline with `${sql.param(value)}` (and `tx.param(value)` in transactions) instead of positional arguments.

- Introspection reports config options of the wrong type and unexpected catalog rows with a clear error instead of failing later.

- Updated dependencies:
  - @typesql/core@6.1.2

## 6.1.1

### Patch Changes

- The README and package homepage link to the merged PostgreSQL adapter page of the documentation.

- Updated dependencies:
  - @typesql/core@6.1.1

## 6.1.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.1.0

## 6.0.3

### Patch Changes

- The READMEs no longer link to an online playground.

- Updated dependencies:
  - @typesql/core@6.0.3

## 6.0.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.2

## 6.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.1

## 6.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.0.0

## 5.0.4

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.4

## 5.0.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.3

## 5.0.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.2

## 5.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.1

## 5.0.0

### Major Changes

- Query inference, migrations and database adapters share smaller implementations while retaining the supported SQL workflows.

### Patch Changes

- Updated dependencies:
  - @typesql/core@5.0.0

## 4.0.1

### Patch Changes

- Standardize installation instructions on pnpm and document packaged consumer validation.

- Build packages with the updated TypeScript toolchain and dependency type definitions.

- Updated dependencies:
  - @typesql/core@4.0.1

## 4.0.0

### Major Changes

- Remove `migrate(db, m)` and `MigrationSource`: run migrations with `createMigrator` from `@typesql/core/migration`, passing a `url` or `db`, or one connection as `execute: executor(client)`.

### Patch Changes

- Updated dependencies:
  - @typesql/core@4.0.0

## 3.0.0

### Patch Changes

- Stop exporting an internal view nullability helper.

- Updated dependencies:
  - @typesql/core@3.0.0

## 2.0.1

### Patch Changes

- Updated dependencies:
  - @typesql/core@2.0.1

## 2.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@2.0.0

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
