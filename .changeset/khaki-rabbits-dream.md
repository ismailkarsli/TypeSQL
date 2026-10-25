---
"@typesql/core": patch
---

An array slice is nullable when a bound is (`nums[n:2]`, `nums[NULL:2]`), as in PostgreSQL, and a subscript chain with a slice (`nums[1][1:2]`) is NULL only through a NULL array or subscript (out of range it is an empty array).
