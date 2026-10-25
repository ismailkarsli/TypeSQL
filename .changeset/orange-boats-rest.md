---
"@typesql/core": patch
---

A DDL statement with an unclosed parenthesis (in a routine's parameters or RETURNS TABLE, a column's CHECK, REFERENCES, GENERATED or index options, a partition bound or key, or a table's or view's WITH options) is a syntax error at the end of input, as in PostgreSQL, instead of being accepted or failing on a later token.
