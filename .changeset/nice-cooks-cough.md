---
"@typesql/sqlite": patch
---

Prepare a sql.prepare() query once, on its first execution, and reuse the statement instead of preparing it on every call.
