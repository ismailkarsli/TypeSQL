---
"@typesql/core": patch
"@typesql/kysely": patch
---

Parameters accept `null` wherever Postgres does: comparisons (`col = $1`, `IN`, `ANY`, `LIKE`), `LIMIT`/`OFFSET`, casts in comparisons and function arguments (`coalesce($1::text, 'x')`), and array elements (`(number | null)[]`); assigning `null` to a `NOT NULL` column is still an error.
