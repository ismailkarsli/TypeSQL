---
"@typesql/core": minor
---

CasePlugin takes options. `new CasePlugin({ to: "snake_case" })` gives snake_case row and write keys for camelCase columns, and `new CasePlugin({ nested: true })` also renames the keys inside JSON values, in rows and in `sql.json()`, `sql.param()`, `sql.set()` and `sql.values()`. A plugin can convert `sql.json()` values with the new optional `transformJson` hook and `json` type function.
