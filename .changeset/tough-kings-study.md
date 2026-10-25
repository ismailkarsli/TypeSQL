---
"@typesql/core": patch
---

Type names take modifiers only where PostgreSQL's grammar does: `int(3)`, `double precision(3)`, `timestamp with time zone(3)`, `varchar(3, 4)`, `float(0)` / `float(54)`, `interval year to day`, `interval day(3)`, `interval(3) day`, `int[] array` and an unclosed modifier list (`'1'::numeric(5`) are errors, and a parenthesis right after an operand (`SELECT 1 (5`) is a syntax error instead of an operator.
