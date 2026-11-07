---
"@typesql/core": patch
---

A statement that fails to compile now uses up its `sql.param()` values, as one that runs does, so they no longer stay in memory. Running the same text again fails with "this sql.param() value was already used".
