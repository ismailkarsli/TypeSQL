---
"@typesql/pg": patch
---

`typesql introspect` now declares your PostgreSQL functions, aggregates and window functions under `$functions`, with overloads, argument defaults, `VARIADIC`, `SETOF` and `RETURNS TABLE` columns. Procedures, trigger functions and extension functions are left out, and `--exclude` patterns apply to functions too. A function that is not `STRICT` can return NULL for any arguments; name the ones that return NULL only for NULL arguments with the new `functionNotNull` option.
