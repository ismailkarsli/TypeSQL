---
"@typesql/core": patch
---

Check inline `sql.param()` and `sql.json()` values, and values in fragments, `sql.set` and `sql.values`, against literal and object types: a value that does not fit a `Json<T>` column's `T` or an enum, such as `sql.json({ theme: "blue" })` for `{ theme: "dark" | "light" }`, is now an error that names the expected type, while a plain `string`, `number` or `boolean` is still checked only for its kind.
