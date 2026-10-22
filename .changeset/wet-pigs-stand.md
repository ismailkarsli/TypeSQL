---
"@typesql/core": patch
---

Add `sql.list(items, separator)`: join a runtime array of fragments with known texts (such as user-chosen `ORDER BY` keys) and keep the statement checked, without `sql.as`.
