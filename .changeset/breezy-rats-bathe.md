---
"@typesql/language-server": patch
---

Editor completions offer the `RETURNING` columns of a data-modifying WITH query (`WITH x AS (INSERT … RETURNING b) SELECT x.|`), and stay quiet inside a dollar-quoted string whose tag is longer than 62 characters or not ASCII; a lone carriage return ends a `--` comment, as in PostgreSQL.
