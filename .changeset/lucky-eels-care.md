---
"@typesql/pg": patch
---

Mark an introspected UNION/INTERSECT/EXCEPT view column NOT NULL only when every branch is, instead of looking at the first branch alone.
