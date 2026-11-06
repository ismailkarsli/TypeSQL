---
"@typesql/sqlite": patch
---

`typesql introspect --dialect sqlite --exclude "a, b"` trims the spaces around each pattern, as the other dialects do.
