---
"@typesql/pg": major
"@typesql/postgres": major
"@typesql/sqlite": major
---

Remove `migrate(db, m)` and `MigrationSource`: run migrations with `createMigrator` from `@typesql/core/migration`, passing a `url` or `db`, or one connection as `execute: executor(client)`.
