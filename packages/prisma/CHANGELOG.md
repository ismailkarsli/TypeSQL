# @typesql/prisma

## 6.1.1

### Patch Changes

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

### Patch Changes

- `executor(prisma)` uses SQLite's `?` placeholders when the client's provider is SQLite, so it works on SQLite, also with the migrator, without the `{ dialect: "sqlite" }` option.

- On PostgreSQL, send every `sql.json()` value to Prisma as a `JSON.stringify` string, so arrays and strings (`sql.json([1, 2])`, `sql.json("hello")`, also in `sql.set` and `sql.values`) no longer fail with `invalid input syntax for type json`.

- Updated dependencies:
  - @typesql/core@4.0.0

## 3.0.0

### Patch Changes

- Stop exporting internal generator helpers.

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

## 0.3.8

### Patch Changes

- Updated dependencies:
  - @typesql/core@1.0.1

## 0.3.7

### Patch Changes

- Write generated schema columns as Col<type, { nullable: true; hasDefault: true }> instead of the removed Nullable, Generated and NullableGenerated helpers.

- Update the README Playground examples to write columns with Col options instead of the removed Nullable and Generated helpers.

- Updated dependencies:
  - @typesql/core@1.0.0

## 0.3.6

### Patch Changes

- Keep Unsupported(...) fields, such as tsvector columns, in the generated schema instead of dropping them.

- Fix the README Playground links, which opened with module resolution that ignores package exports and showed no TypeSQL errors or types.

- Updated dependencies:
  - @typesql/core@0.10.1

## 0.3.5

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.10.0

## 0.3.4

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.2

## 0.3.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.1

## 0.3.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.0

## 0.3.1

### Patch Changes

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.

- Updated dependencies:
  - @typesql/core@0.8.1
