---
"@typesql/core": patch
---

Calling an unknown function is a compile error (`function f(text) does not exist`, with a "Perhaps you meant" hint); declare app and extension functions under `$functions` in the schema or in `FunctionCatalog`, `CREATE FUNCTION` in migrations registers them, and every other `pg_catalog` function is known with its return type.
