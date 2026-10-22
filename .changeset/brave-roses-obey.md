---
"@typesql/core": patch
---

A parameter tested with `IS NULL` or `IS NOT NULL`, as in `($1::text IS NULL OR col = $1)`, accepts `null`.
