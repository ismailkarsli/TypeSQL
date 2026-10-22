---
"@typesql/pg": patch
---

Rows with `interval` columns are plain object types, so a package that exports them no longer needs `@typesql/pg` as a dependency for declaration emit (TS2883); `PgInterval` stays exported.
