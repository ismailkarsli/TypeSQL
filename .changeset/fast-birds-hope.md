---
"@typesql/core": patch
---

Named parameters are read the same way in the types as at runtime: a colon followed by a space (`JSON_OBJECT('a': v)`, `a[1: n]`) is no longer a parameter and no longer a syntax error, `:name` inside a dollar-quoted string is not one, and a `:name` that PostgreSQL reads inside a string or comment takes no value. `FromKysely` no longer registers an enum for a string-literal column overridden to a system type such as `xid` or `pg_lsn`.
