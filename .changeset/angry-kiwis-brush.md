---
"@typesql/core": patch
---

MySQL and MariaDB: `WHERE x = ANY (SELECT …)` and `x <> SOME (SELECT …)` make `x` non-null, like `IN (SELECT …)`.
