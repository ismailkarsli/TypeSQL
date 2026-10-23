---
"@typesql/core": patch
---

Type-checking a query costs a little less: the scans for `$n`, `:name` and quoted text at the call site do less work.
