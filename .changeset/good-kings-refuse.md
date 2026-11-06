---
"@typesql/core": patch
---

PostgreSQL: `Col<"char">`, as introspection writes it, and `"char"` in DDL and typed literals are the one-byte `"char"` type rather than `char(n)` (`bpchar`).
