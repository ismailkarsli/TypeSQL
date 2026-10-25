---
"@typesql/core": patch
---

OVERLAY checks and types all its operands: a nullable PLACING, FROM or FOR value makes the result nullable, an unknown column there is an error, and their `$n` are typed (text, integer); `substring($1 FOR $2)` types `$2` as an integer, as PostgreSQL does.
