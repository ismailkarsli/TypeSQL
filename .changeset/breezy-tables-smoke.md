---
"@typesql/core": patch
---

A plain parameter value can no longer take another statement's pending `sql.param()` or `sql.json()` value: every marker carries its own random id, and `sql.param()` and `sql.json()` reject a value that holds another one, as a type error and at runtime, so a marker's text is no longer stored in the database.
