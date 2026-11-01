---
"@typesql/core": patch
"@typesql/postgres": patch
"@typesql/sqlite": patch
---

Columns with different `Col` options are no longer assignable to each other: `Col<"int8", { nullable: true }>` to `Col<"int8">`, or a SQLite column with `rowid`, `generated`, `hidden` or `position` to one without. Nor is an `sql` for one schema, type map, plugin list or dialect assignable to one for another: `const sql: Sql<DB, DefaultTypeMap> = createSql<OtherDB>(postgres)` is an error.
