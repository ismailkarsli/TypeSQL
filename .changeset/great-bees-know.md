---
"@typesql/mysql": patch
---

`typesql introspect` now declares the stored functions of a MySQL or MariaDB database under `$functions`, with their parameter and return types. They can return NULL for any arguments, unless `introspect()`'s new `functionNotNull` option names them.
