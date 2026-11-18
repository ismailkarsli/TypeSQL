---
"@typesql/sqlite": patch
"@typesql/core": patch
---

On node:sqlite and bun:sqlite, a query of several statements, such as `sql.as("INSERT …; DELETE …")`, is an error. Before, only the first statement ran.
