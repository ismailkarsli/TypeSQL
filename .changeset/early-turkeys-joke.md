---
"@typesql/core": patch
---

`typesql migrate generate` writes a PostgreSQL JSON column a migration types with `Json<T>` (in `.raw<…>()`) as `Json<T, …>` with its import, like `typesql introspect`, instead of a schema file that does not compile.
