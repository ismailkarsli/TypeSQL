---
"@typesql/kysely": patch
---

Kysely columns typed `Record<string, …>` are inferred as `jsonb` instead of the interval object.
