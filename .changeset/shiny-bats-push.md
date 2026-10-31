---
"@typesql/core": patch
---

Type statements with deeply nested subqueries that have a `LIMIT` or `OFFSET` parameter, as in `limit ${sql.param(1)}` three or more levels down, which failed with TS5115 "Instantiations … appear infinitely circular": parameter inference no longer nests the parameters found so far into each level, and skips `ORDER BY` handling when there is no `ORDER BY`.
