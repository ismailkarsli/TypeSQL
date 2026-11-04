---
"@typesql/core": patch
---

Without `strictNullChecks`, every member of `sql` (such as `sql.begin`) reports the strictNullChecks requirement instead of returning `any`, and the built-in SQLite migration connection names the parameter it cannot bind.
