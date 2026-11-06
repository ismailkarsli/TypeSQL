---
"@typesql/core": patch
---

PostgreSQL and SQLite: a `WHERE` condition that rejects NULL in a column of an outer-joined table gives all of that table's columns their declared nullability again, as MySQL already did (`LEFT JOIN posts p … WHERE p.title = $1` makes `p.id` non-null).
