---
"@typesql/core": patch
---

A multi-column `SET (a, b) = (…)` checks a literal NULL, or a DEFAULT without a default, in a NOT NULL column like a single-column SET does, and a SET list reports PostgreSQL's first error: every value is typed before the target columns are checked.
