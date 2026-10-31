---
"@typesql/core": patch
---

Infer parameters in window `PARTITION BY` and `ORDER BY`, named `WINDOW` clauses, `DISTINCT ON` and a query's `ORDER BY`, which were left untyped. They accept `null`, as in `ORDER BY abs(extract(epoch from at - $1::timestamptz))`, unless another use of the parameter rejects it.
