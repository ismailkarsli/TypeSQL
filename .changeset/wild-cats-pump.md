---
"@typesql/core": patch
---

Parameters accept what the driver can serialize on top of the row type (`int8`, `numeric` and `money` take `number | bigint | string`, dates and timestamps take `Date | string`), also when a type map types those rows differently; a type map can declare its own input types under `$params`.
