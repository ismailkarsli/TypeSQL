---
"@typesql/core": patch
---

A whole-row reference to a FROM item without columns (`(SELECT) s`) is typed nullable: on the null-extended side of an outer join it is NULL, which nothing else tells.
