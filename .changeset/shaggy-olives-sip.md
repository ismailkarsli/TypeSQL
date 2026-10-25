---
"@typesql/core": patch
---

SELECT's tail and FROM items are read as PostgreSQL reads them: a second LIMIT, OFFSET or FETCH, `LIMIT n, m`, FETCH without ROW or ROWS, WITH TIES without ORDER BY, `FOR UPDATE OF` without names, a locking clause both before and after LIMIT or on a parenthesized set operation, a table or parenthesized join after LATERAL, and `ONLY f()`, `ONLY (SELECT …)` or `ONLY t *` are errors; `FOR READ ONLY`, `FROM ONLY (t)`, `TABLE ONLY (t)`, `LATERAL current_date` (and the other function-like keywords) and `SELECT … INTO temp` (TEMP, TEMPORARY or UNLOGGED as the new table's name) are accepted.
