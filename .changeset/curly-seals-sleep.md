---
"@typesql/core": patch
---

Subscripts of `point`, `line` (`float8`), `lseg`, `box` (`point`) and `name` (`"char"`) are typed as in PostgreSQL instead of `unknown`, and a `UESCAPE` at the end of the statement reports `UESCAPE must be followed by a simple string literal at end of input`.
