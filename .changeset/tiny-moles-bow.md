---
"@typesql/core": patch
---

Syntax errors in `1 + ANY 2`, `f(1 => x)`, `current_date()` and `localtime('a')` point at the token PostgreSQL points at, and `current_user(1)` is a syntax error, as in PostgreSQL.
