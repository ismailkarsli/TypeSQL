---
"@typesql/core": patch
---

Subscripts in a row on an array (`a[1][2]`, `a[1][1:2]`) apply to the array together, as in PostgreSQL: they are typed as its element, or as the array when one is a slice, instead of `unknown`.
