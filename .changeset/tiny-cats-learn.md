---
"@typesql/core": patch
---

`sql.withPlugin()` on the `sql` of `createSql()` keeps its dialect's type, as on the adapters' `sql`: its `.dialect`, and an `Sql<DB, TM, [CasePlugin]>` annotation, compile.
