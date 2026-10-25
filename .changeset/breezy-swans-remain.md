---
"@typesql/core": patch
---

`$1 BETWEEN a AND b` types the parameter as `a` (`$1 BETWEEN id AND big` → `number`, not `string | number | bigint`), as in PostgreSQL, which resolves `$1 >= a` first.
