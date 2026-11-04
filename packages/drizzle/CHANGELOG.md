# @typesql/drizzle

## 6.1.3

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

- Updated dependencies:
  - @typesql/core@6.1.3

## 6.1.2

### Patch Changes

- The README examples pass values inline with `${sql.param(value)}` (and `tx.param(value)` in transactions) instead of positional arguments.

- `createSql` throws right away when `db` is not a Drizzle database of the chosen dialect.

- Updated dependencies:
  - @typesql/core@6.1.2

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

- `executor(db)` works on a Drizzle SQLite database too, as `sqliteExecutor(db)` does, instead of failing because the database has no PostgreSQL client.

- On postgres.js, read `timestamp` (without time zone) columns and arrays as UTC, as Drizzle's `timestamp()` does, so a `Date` comes back unchanged whatever the process time zone; parse `date`, `timestamp`, `timestamptz` and `numeric` arrays of any dimension; and send JS arrays of strings, numbers, bigints, booleans and dates as array literals, so `Date[]` and `numeric[]` parameters work.

- Updated dependencies:
  - @typesql/core@4.0.0

## 3.0.0

### Patch Changes

- Stop exporting an internal casing type.

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

- Use Col flags instead of the removed Nullable and Generated helpers in schema types and examples.

- Updated dependencies:
  - @typesql/core@1.0.0

## 0.3.6

### Patch Changes

- Return libsql BLOB values as Uint8Array, as typed, instead of ArrayBuffer.

- Parse node-postgres arrays of enums, domains and extension types such as citext, which pg returns as raw {…} strings, so they match their array types.

- Keep explicitly named Drizzle columns as written under the casing option, as Drizzle does, instead of renaming them.

- Limit the drizzle-orm peer range to versions before 1.0, whose prereleases break the schema types.

- On drizzle-orm/postgres-js, serialize sql.json(), object and Date parameters and parse date, timestamp and timestamptz columns back to Date, since Drizzle turns off postgres.js' own serializers and parsers; on better-sqlite3, execute() on INSERT, UPDATE and DELETE without RETURNING no longer throws.

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
