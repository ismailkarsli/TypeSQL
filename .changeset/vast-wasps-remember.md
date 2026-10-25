---
"@typesql/core": patch
---

The merged column of `FULL JOIN … USING` / `NATURAL FULL JOIN` is nullable when either side's column is (a row without a match carries that side's NULL), as in PostgreSQL; it was non-null unless both were nullable.
