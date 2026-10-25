---
"@typesql/core": patch
---

A recursive CTE whose recursive term takes more than three steps to carry a NULL into a column types every column nullable, instead of typing the columns the NULL had not reached yet non-null; a recursive CTE whose query has its own WITH clause is accepted (it was `relation "s" does not exist`).
