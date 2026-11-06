---
"@typesql/pg": patch
"@typesql/mysql": patch
"@typesql/sqlite": patch
---

The introspection `main(argv, io?)` takes an `io` with any of `stdout`, `stderr`, `cwd` and `env`, the process's by default. `typesql introspect` reports a failed connection as `cannot connect to PostgreSQL: …` (or MySQL).
