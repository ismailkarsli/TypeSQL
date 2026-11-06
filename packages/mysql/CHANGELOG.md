# @typesql/mysql

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
