---
"@typesql/pg": patch
"@typesql/mysql": patch
"@typesql/drizzle": patch
---

A script of several statements, such as one passed to `sql.as()`, resolves to its last statement's rows and count, as the migrator's `.raw()` does: node-postgres scripts no longer fail with `Cannot read properties of undefined`, and mysql2 scripts (with `multipleStatements`) no longer return every statement's result as rows.
