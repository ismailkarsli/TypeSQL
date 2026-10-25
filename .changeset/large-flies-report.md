---
"@typesql/core": patch
---

Subscripting an enum (`mood[1]`, in a query or as an assignment target) reports PostgreSQL's `cannot subscript type mood because it does not support subscripting`.
