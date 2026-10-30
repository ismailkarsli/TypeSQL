---
"@typesql/core": patch
---

Allow an outer query's aggregate in a subquery's WHERE, keep CASE and COALESCE over oid, reg* and domain types compiling, and avoid excessive-depth errors on long || chains from the new aggregate checks.
