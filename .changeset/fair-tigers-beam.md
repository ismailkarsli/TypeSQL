---
"@typesql/core": patch
---

Statements type-check with about 10% fewer type instantiations, mostly in parameter checks, fragment interpolation, sql.values and sql.set, and parsing.
