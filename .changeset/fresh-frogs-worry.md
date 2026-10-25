---
"@typesql/core": patch
---

A parameter in a numeric-category argument (`abs($1)`, `width_bucket($1, …)`) is `float8` (`number`) instead of `numeric`, and `to_tsvector($1)` / `ts_headline($1, …)` take text instead of jsonb, as PostgreSQL resolves them.
