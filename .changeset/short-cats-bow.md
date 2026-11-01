---
"@typesql/core": patch
---

Report the SqlError of an invalid statement called with arguments again, as in `sql("SELECT emial FROM users WHERE id = $1", 1)`, with `$1` or `:name` parameters, instead of `Expected 1 arguments, but got 2`; the function `sql.prepare()` returns for such a statement no longer adds an argument-count error either.
