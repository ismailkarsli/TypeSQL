---
"@typesql/core": patch
---

Syntax errors after a `WITH` that is not followed by `(` in CREATE TABLE / VIEW, after `UPDATE` without `SET` or `DO` without `NOTHING` in a MERGE action, and after an `AS` without a label point at the token PostgreSQL points at.
