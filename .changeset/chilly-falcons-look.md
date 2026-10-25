---
"@typesql/core": patch
---

Assigning `DEFAULT` through an indirection (`SET a[1] = DEFAULT`, `INSERT INTO t (c.f) VALUES (DEFAULT)`, also in a multi-column SET and in MERGE) is rejected with PostgreSQL's `cannot set an array element to DEFAULT` / `cannot set a subfield to DEFAULT` (it was accepted, or `DEFAULT is not allowed in this context`).
