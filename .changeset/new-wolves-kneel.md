---
"@typesql/core": patch
---

SQLite: `x / - -0` (and `%`) is nullable, since `- -0` is zero, and `x / +2` is not.
