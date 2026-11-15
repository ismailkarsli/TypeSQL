---
"@typesql/core": major
---

The dialect values are renamed: `postgresDialect` from `@typesql/core/postgres`, `sqliteDialect` from `@typesql/core/sqlite`, and `mysqlDialect` and `mariadbDialect` from `@typesql/core/mysql`. The old names `postgres`, `sqlite`, `mysql` and `mariadb` clashed with the default imports of postgres.js and the mariadb connector. The dialect types (`PostgresDialect`, `SqliteDialect`, `MySqlDialect`, `MariaDbDialect`) are unchanged.
