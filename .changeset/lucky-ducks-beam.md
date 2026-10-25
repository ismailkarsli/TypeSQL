---
"@typesql/core": patch
---

Interval literals take only PostgreSQL's fields after the string (`interval '1' year to day`, `interval day '1'` and `interval(2) '1' day` are syntax errors), a keyword type with array bounds is no typed literal (`numeric[] '{1}'`), `substring(e FOR n FROM m)` is accepted and `substring(e FROM a FROM b)` rejected, and window frames are checked as in PostgreSQL (`frame start cannot be UNBOUNDED FOLLOWING`, `GROUPS mode requires an ORDER BY clause`, …).
