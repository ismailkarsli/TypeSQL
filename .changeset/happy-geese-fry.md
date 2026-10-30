---
"@typesql/core": patch
"@typesql/pg": patch
"@typesql/drizzle": patch
---

Parse node-postgres arrays of enums, domains and extension types such as citext, which pg returns as raw {…} strings, so they match their array types.
