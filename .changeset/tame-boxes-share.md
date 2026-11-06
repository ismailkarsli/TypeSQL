---
"@typesql/core": patch
---

On MySQL and MariaDB, a plain object for a JSON parameter is a type error, as the drivers refuse it at runtime: pass `sql.json(value)` or JSON text. An inline array or object for a JSON parameter there says `must be passed as sql.json(value)`, and MySQL and SQLite messages name a `Json<T>` column type `json` instead of printing its internal type.
