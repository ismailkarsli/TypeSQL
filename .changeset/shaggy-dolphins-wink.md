---
"@typesql/pg": patch
---

`stream()` reads rows through a `pg-cursor` cursor, a new optional peer dependency that it loads when first used. On a `Pool` it checks out a client for the stream and releases it when the stream ends.
