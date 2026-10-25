---
"@typesql/core": patch
---

SQL/JSON ON EMPTY / ON ERROR clauses are checked as in PostgreSQL: a behavior the function or JSON_TABLE column does not allow is an error (`invalid ON ERROR behavior`, `invalid ON EMPTY behavior for column "a"`), and so is a DEFAULT that is a bare parameter, column or subquery (`can only specify a constant, non-aggregate function, or operator expression for DEFAULT`).
