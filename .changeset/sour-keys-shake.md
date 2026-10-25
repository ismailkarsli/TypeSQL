---
"@typesql/core": patch
---

JSON_TABLE reports its errors in PostgreSQL's order: a path that is not a string constant, then a repeated column or path name, then an error in the context item, PASSING values or DEFAULTs, then a table name used twice.
