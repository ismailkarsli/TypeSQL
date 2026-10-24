---
"@typesql/pg": patch
---

`typesql introspect` no longer hangs on views that read each other (`CREATE OR REPLACE VIEW` allows the cycle); their columns are nullable.
