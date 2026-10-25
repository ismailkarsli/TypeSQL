---
"@typesql/core": patch
---

Keywords are read as in PostgreSQL 18: every keyword but the 39 that `pg_get_keywords()` marks as no bare label is a column label without AS, reserved ones too (`SELECT 1 all`, `SELECT 1 and, 2`, `SELECT x like FROM t`); any keyword is a name after a dot (`t.from`, `public.select`); type/function-name keywords such as `left` or `is` name functions only, no tables, columns, aliases, CTEs or constraints; `exists` without a parenthesis is a column; column-name keywords like `between` are no type names; and `FOR` without a lock strength is a syntax error.
