---
"@typesql/core": minor
---

Every `sql` has a read-only `sql.dialect`, `"postgres"` or `"sqlite"`, typed as that literal, so libraries that take your `sql` can tell which database it runs on.
