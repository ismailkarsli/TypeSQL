---
"@typesql/kysely": patch
---

`JSONColumnType` columns holding an array are inferred as `jsonb` instead of a Postgres array (`text[]`, `jsonb[]`).
