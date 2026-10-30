---
"@typesql/pg": patch
---

Label PostgreSQL 18 VIRTUAL generated columns as VIRTUAL in introspected JSDoc, and fail with a clear message instead of writing an invalid file when a relation or schema is named $types or $functions.
