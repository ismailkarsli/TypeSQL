# @typesql/postgres

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

- `PostgresJsTransactable.begin` returns the result type of its callback instead of `unknown`.

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

- The documentation reflects migration tracking and locking, supported driver and editor versions, and the current query APIs.

- Updated dependencies:
  - @typesql/core@5.0.1

## 5.0.0

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

- Columns with different `Col` options are no longer assignable to each other: `Col<"int8", { nullable: true }>` to `Col<"int8">`, or a SQLite column with `rowid`, `generated`, `hidden` or `position` to one without. Nor is an `sql` for one schema, type map, plugin list or dialect assignable to one for another: `const sql: Sql<DB, DefaultTypeMap> = createSql<OtherDB>(postgres)` is an error.

- Updated dependencies:
  - @typesql/core@4.0.0

## 3.0.0

### Patch Changes

- Remove the unused postgres development dependency; postgres stays a peer dependency.

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

## 0.3.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@1.0.1

## 0.3.2

### Patch Changes

- Update the README Playground examples to write columns with Col options instead of the removed Nullable and Generated helpers.

- Updated dependencies:
  - @typesql/core@1.0.0

## 0.3.1

### Patch Changes

- Run sql.transaction() on a postgres.js ReservedSql with BEGIN/COMMIT and savepoints instead of always rejecting, and stop accepting epoch-millisecond numbers for date parameters, which postgres.js 4 rejects.

- Fix the README Playground links, which opened with module resolution that ignores package exports and showed no TypeSQL errors or types.

- Updated dependencies:
  - @typesql/core@0.10.1

## 0.3.0

### Minor Changes

- Replace rowKeys options with CasePlugin while retaining bigint configuration.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.10.0

## 0.2.14

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.2

## 0.2.13

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.1

## 0.2.12

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.0

## 0.2.11

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.8.1
