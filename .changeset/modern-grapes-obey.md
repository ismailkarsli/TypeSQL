---
"@typesql/postgres": patch
---

`PostgresJsTransactable.begin` returns the result type of its callback instead of `unknown`.
