---
"@typesql/core": patch
---

`EXTRACT` of a field an infinite timestamp, date or interval has no value of (`day`, `month`, `second`, …) is nullable: PostgreSQL returns NULL there (`year`, `epoch`, … are ±Infinity).
