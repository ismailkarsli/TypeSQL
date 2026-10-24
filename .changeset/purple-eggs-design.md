---
"@typesql/core": patch
---

Types follow PostgreSQL 18: `PgCatalog` has the new catalog columns (`pg_attribute.attcacheoff` is gone), the new built-in functions are known, and `reverse(bytea)` and `json(b)_strip_nulls(x, strip_in_arrays)` are typed.
