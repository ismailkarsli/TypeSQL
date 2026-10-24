---
"@typesql/core": patch
---

`SUBSTRING` and `OVERLAY` of a `varbit` are typed `bit`, as in PostgreSQL.
