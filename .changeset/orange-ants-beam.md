---
"@typesql/core": patch
---

Type window aggregates as nullable when their frame can be empty (both bounds before or after the current row, or EXCLUDE CURRENT ROW / GROUP), which returned NULL while typed non-null.
