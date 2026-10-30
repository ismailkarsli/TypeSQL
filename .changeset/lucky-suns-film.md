---
"@typesql/sqlite": patch
---

Stop introspection from marking an INTEGER PRIMARY KEY DESC column as the rowid alias, which SQLite doesn't make it.
