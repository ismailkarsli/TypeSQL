---
"@typesql/core": major
---

`sql.json(undefined)` now sends `DEFAULT` like `sql.param(sql.empty)` instead of SQL `NULL` (`sql.json(null)` still sends `NULL`): inline, a `sql.json()` value that can be `undefined` is only accepted where `DEFAULT` is; as a positional or named argument it is a compile error and throws; and `sql.set` and `sql.values` leave the column out, as they do for `undefined`.
