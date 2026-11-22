---
"@typesql/core": patch
---

Queries have `stream({ batchSize })`, which yields the rows one at a time as the executor reads them in batches (1 by default), applies output plugins to each and stops the query when the loop ends early. An executor streams with a new optional `stream(text, values, batchSize)` method; without one, `stream()` rejects. `parsePgUserArrays` in `@typesql/core/adapter` takes `undefined` for a connection that cannot look types up.
