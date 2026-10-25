---
"@typesql/core": patch
---

An error located at a keyword (`DEFAULT is not allowed in this context`, `ORDER BY position … is not in select list`, `each UNION query …`, `UNION types … cannot be matched`, `SELECT ... INTO is not allowed here`) points at the keyword, not at an earlier quoted identifier spelled like it (`AS "union"`).
