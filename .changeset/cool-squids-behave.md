---
"@typesql/core": patch
---

Accept an unqualified column in a SQLite upsert's `DO UPDATE SET` and `WHERE`, as in `ON CONFLICT (name) DO UPDATE SET n = n + 1`: it names the target table's column, as in SQLite, and was rejected as an ambiguous column name. `excluded.n` still names the proposed row.
