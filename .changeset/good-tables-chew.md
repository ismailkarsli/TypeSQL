---
"@typesql/core": patch
---

Expressions parse as PostgreSQL's grammar reads them: `a = b = c`, `a LIKE b LIKE c`, `a BETWEEN b AND c IN (…)` and `a IS DISTINCT FROM b IS NULL` are syntax errors; a subscript or field selection follows only a column, a parameter, a subquery or a parenthesized expression (`f(x)[1]`, `ARRAY[1][1]`, `ROW(1, 2).f1` are syntax errors, `(f(x))[1]` works); `x IN ((SELECT 1), 2)` is a list; and `a OPERATOR(pg_catalog.+) b` is typed as `a + b` and takes `ANY (…)`.
