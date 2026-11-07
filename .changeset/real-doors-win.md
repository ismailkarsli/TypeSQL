---
"@typesql/core": patch
---

`CasePlugin` throws when two keys of one write object rename to the same key, such as `{ SASA: 1, sasa: 2 }` with `nested`, or a `displayName` and `display_name` column in `sql.set()`. Before, the earlier value was silently lost.
