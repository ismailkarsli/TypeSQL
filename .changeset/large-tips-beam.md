---
"@typesql/core": patch
---

A statement or `.ddl()` script of more than 4096 tokens is the error `the SQL text has 4110 tokens, more than the 4096 TypeSQL can check`. Before, it was a syntax error at a valid token, such as a quoted `"group"` column.
