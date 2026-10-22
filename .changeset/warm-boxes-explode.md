---
"@typesql/pg": patch
---

`typesql introspect` (a bin of `@typesql/pg`, also `@typesql/pg/introspect`) writes the schema of a live database: exact column types, domains as their base type, enums, arrays, views with nullability read from their definitions, other schemas nested, and TypeScript types for JSON columns.
