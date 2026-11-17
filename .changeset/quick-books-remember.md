---
"@typesql/core": patch
---

A cast parameter passed as a named function argument, `f(name => ${sql.param(value)}::text)`, accepts `null` as a positional one does.
