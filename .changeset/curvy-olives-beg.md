---
"@typesql/core": patch
---

`ARRAY[]` without a cast to an array type is an error, as in PostgreSQL (`cannot determine type of empty array`); `ARRAY[ARRAY[]]::int4[]` is typed by its cast.
