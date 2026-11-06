---
"@typesql/core": patch
---

A `Json<T>` value reads by one rule on every database: as `T`, unless the type map reads JSON as a `string`, as SQLite's maps do. A MySQL map with `json: string` (mysql2's `jsonStrings`) now reads `Json<T>` columns as text, and a SQLite map that reads JSON parsed reads them as `T`.
