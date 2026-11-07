# @typesql/mysql

## 7.7.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.7.0

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

- On the HTTP drivers (TiDB Cloud and PlanetScale serverless), a `'` in a value is written as `''`, so a value cannot end its string on a server with `NO_BACKSLASH_ESCAPES`. Backslashes in values are still corrupted in that mode.

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

### Minor Changes

- New package `@typesql/mysql`: `createSql<DB>(client)` runs queries on mysql2 (MySQL, Amazon Aurora and RDS, Google Cloud SQL, Azure, TiDB, and MariaDB with `{ dialect: "mariadb" }`), `@typesql/mysql/mariadb` on the mariadb connector, and `@typesql/mysql/planetscale` and `@typesql/mysql/tidb` on the serverless drivers, each with the type map of its driver. `$1` parameters become `?`, `sql.json(value)` is sent as JSON text, `sql.prepare()` uses the binary protocol where the driver has one, and `sql.transaction()` takes one connection from a pool and nests with savepoints. `@typesql/mysql/introspect` reads a live database's tables and views with each column's type, nullability, default, position, `ENUM` values, `AUTO_INCREMENT`, and generated and invisible columns.

### Patch Changes

- Updated dependencies:
  - @typesql/core@6.2.0
