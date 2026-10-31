---
"@typesql/core": patch
---

Reject comparisons PostgreSQL has no operator for, between numbers, strings, booleans, date/time values, intervals, `uuid` and `bytea` of different kinds, as in `id = email` or `id IN (SELECT title FROM posts)`: `=`, `<>`, `<` and the other comparison operators, `IS DISTINCT FROM`, `IN` lists and subqueries, `ANY`/`ALL` subqueries and row comparisons now give `operator does not exist: integer = text`, as PostgreSQL does. Literals, parameters, enums, arrays and domains are still accepted.
