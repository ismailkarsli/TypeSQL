---
"@typesql/core": minor
---

A PostgreSQL migration's `db` reads rows as the migrator's `pg` client returns them, with the new `NodePostgresTypeMap` from `@typesql/core/postgres`: `record`, `void`, `"char"[]` and `aclitem[]` values are strings and intervals have `toPostgres()`.
