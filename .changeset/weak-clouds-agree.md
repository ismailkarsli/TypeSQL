---
"@typesql/core": patch
---

Reject queries on a transaction's tx after its callback has settled, instead of running them outside the transaction on a released connection.
