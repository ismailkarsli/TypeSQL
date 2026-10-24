---
"@typesql/core": patch
---

A typed literal with a schema-qualified type name, `pg_catalog.int4 '1'`, is accepted (the schema is dropped, as in casts) instead of being a syntax error.
