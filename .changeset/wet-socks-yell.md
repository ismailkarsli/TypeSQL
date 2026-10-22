---
"@typesql/core": patch
---

JSON built in SQL is typed: `json_build_object`, `json_build_array`, `json_agg`, `json_object_agg` and `to_json(t)` give the JSON's structure (values typed as Postgres serializes them, so timestamps are strings), `->`, `#>` and subscripts follow it, and JSON aggregates in a grouped query are no longer nullable.
