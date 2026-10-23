---
"@typesql/core": minor
---

Queries can use `ROWS FROM (f(…), g(…)) [WITH ORDINALITY]`, `TABLESAMPLE method (…) [REPEATABLE (…)]`, `SEARCH` / `CYCLE` on recursive CTEs (the columns they add are typed), joins nested Postgres-style (`a JOIN b LEFT JOIN c ON … ON …`, `((SELECT …) s JOIN t ON …) j`) and `WITHIN GROUP (ORDER BY a, b)`.
