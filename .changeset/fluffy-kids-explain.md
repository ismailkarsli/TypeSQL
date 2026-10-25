---
"@typesql/core": patch
---

An ordered-set aggregate without WITHIN GROUP is an error, as in PostgreSQL (`function percentile_cont(numeric) does not exist`, `WITHIN GROUP is required for ordered-set aggregate rank`); it was accepted.
