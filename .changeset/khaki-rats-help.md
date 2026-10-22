---
"@typesql/core": patch
---

Compile errors on long statements show the SqlError message first (`SqlError<…> & "…SQL…"`), so it is no longer cut off when TypeScript truncates the statement text in the diagnostic.
