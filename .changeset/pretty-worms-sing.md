---
"@typesql/core": patch
---

Subscripting a value of a type without subscripts (`json`, `text`, …) is an error in any expression, and a `jsonb` slice is too, as in PostgreSQL; they were typed `unknown`.
