---
"@typesql/kysely": patch
---

`execute(db, q)` returns the number of rows for statements Kysely reports no `numAffectedRows` for (`SELECT`), as `@typesql/pg` does, instead of 0.
