---
"@typesql/postgres": patch
---

Run sql.transaction() on a postgres.js ReservedSql with BEGIN/COMMIT and savepoints instead of always rejecting, and stop accepting epoch-millisecond numbers for date parameters, which postgres.js 4 rejects.
