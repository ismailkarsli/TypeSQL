---
"@typesql/core": patch
---

PostgreSQL: `CASE`, `COALESCE`, `GREATEST`, `LEAST` and `ARRAY[]` over values with no common type are errors like `UNION` already was (`CASE types point and integer cannot be matched`), types such as `oid` and `integer` that convert implicitly combine instead of failing, and `= ANY(x)` rejects every non-array `x`.
