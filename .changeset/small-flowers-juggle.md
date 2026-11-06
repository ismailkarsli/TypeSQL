---
"@typesql/core": patch
---

A PostgreSQL or SQLite name with `$` in it (`a$b$`, `x$1`) is read as a name: in PostgreSQL `sql()` text, `a$b$` no longer opens a dollar quote that hid the `:name` parameters and inline values after it, and `x$1` is no longer counted or renumbered as parameter `$1` when a statement runs.
