---
"@typesql/core": patch
---

Accept `sql.json()` over a recursive JSON type such as zod's `z.core.util.JSONType`, which failed with TS5115 ("Instantiations of the following types appear infinitely circular").
