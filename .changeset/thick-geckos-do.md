---
"@typesql/core": patch
---

In PostgreSQL, a function call holding a parameter in the values of `INSERT` or `MERGE` no longer fails with an "infinitely circular" error that turned later statements in the file into `any`, nor does `(f(x)).*`. `x = ANY(array)` and `x = ALL(array)` are nullable when the array can hold `NULL` elements. In migrations, `begin` and `end` used as names (`NEW.end`, `AS end`, a parameter or routine called `begin`) no longer hide a later `COMMIT` or reject a valid trigger, and `CASE … END FOR UPDATE` ends the `CASE`.
