---
"@typesql/core": patch
---

`UPDATE … SET (a) = x` with a source that is neither `ROW(…)` nor a subquery is an error, as in PostgreSQL (`source for a multiple-column UPDATE item must be a sub-SELECT or ROW() expression`).
