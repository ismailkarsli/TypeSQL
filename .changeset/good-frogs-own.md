---
"@typesql/core": patch
"@typesql/sqlite": patch
---

The schema files of `typesql migrate generate` and `typesql introspect --dialect sqlite` give the hidden columns of a virtual table (FTS5's table-named column and `rank`) `hasDefault: true`, as the schema a migration leaves does: an INSERT without a column list leaves them out.
