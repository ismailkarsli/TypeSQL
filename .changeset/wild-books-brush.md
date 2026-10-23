---
"@typesql/core": patch
---

The pattern forms of `SUBSTRING` (`FROM 'regex'`, `SIMILAR … ESCAPE …`) are nullable, `FETCH … WITH TIES` may be followed by `OFFSET`, and `CREATE VIEW … USING` is a syntax error, as in Postgres.
