---
"@typesql/core": patch
---

FROM, GROUP BY and WITH clauses parse as in PostgreSQL: `GROUP BY cube` / `rollup` name columns, a function's `alias(a, b int)` and a table's `alias(a b)` fail at the token PostgreSQL reports, a column definition list needs an alias (`f() (a int)` is a syntax error), a `USING (…) AS` join alias must be a column name (`AS order` is an error), a CYCLE mark value in parentheses is rejected, and a join word without JOIN, a bad CTE column list or a name as a CYCLE value is reported where PostgreSQL reports it.
