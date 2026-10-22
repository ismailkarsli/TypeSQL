---
"@typesql/core": patch
"@typesql/pg": patch
---

An opt-in `PgCatalog` slice types queries on `pg_stat_activity`, `pg_stat_database`, `pg_tables`, `pg_class`, `information_schema.columns` and other system catalogs: `createSql<DB & PgCatalog>()`.
