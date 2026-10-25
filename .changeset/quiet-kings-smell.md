---
"@typesql/core": patch
---

ORDER BY, GROUP BY and DISTINCT ON read a position the way PostgreSQL folds the constant: in any radix and with digit separators (`ORDER BY 0x2` is position 2, it was `non-integer constant in ORDER BY`), and under unary minus (`GROUP BY -1` and `ORDER BY - -5` are positions, `ORDER BY -1.5` is a non-integer constant); position 0 or a negative one is an error after a `*` too.
