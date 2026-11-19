---
"@typesql/core": patch
---

TypeScript checks statements with less work, such as fewer comparisons of tuples to array types: about 10% less check time on a large PostgreSQL application, with the same types and errors.
