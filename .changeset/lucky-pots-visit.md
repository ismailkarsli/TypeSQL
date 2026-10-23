---
"@typesql/core": minor
---

Parse and type more PostgreSQL expression syntax: typed literals with keyword type names (`timestamp with time zone '…'`, `char(20) '…'`, `interval(2) '…'`), named (`f(a => 1)`, `f(a := 1)`) and `VARIADIC` arguments, `x LIKE ANY (…)` and `op ANY/ALL` with every operator, `(a, b) OVERLAPS (c, d)`, `AT LOCAL`, `IS [NFC|…] NORMALIZED`, `COLLATION FOR (…)`, `SUBSTRING(… SIMILAR … ESCAPE …)`, `e[i].field`, several `WITHIN GROUP` sort keys, and `CURRENT_DATE`, `CAST(…)` or `COLLATION FOR (…)` in FROM.
