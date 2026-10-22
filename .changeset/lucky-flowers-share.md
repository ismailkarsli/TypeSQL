---
"@typesql/core": patch
---

A table alias used as a value is a whole-row reference: `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)` and `t IS NULL` no longer fail with "column does not exist", and `(t).col` / `(t).*` read its columns.
