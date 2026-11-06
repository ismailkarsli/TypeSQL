---
"@typesql/core": patch
---

PostgreSQL: a `$functions` signature's `strict: [n]` checks arguments past the eighth, and an unknown function's message suggests the closest `pg_catalog` function too (`crc33` → `crc32`).
