---
"@typesql/core": patch
---

The runtime is smaller: `@typesql/core` is about 3.6 kB minified and gzipped, down from 5.2 kB, with the same API. Its error messages are shorter. Queries and fragments are now class instances, so `console.log(query)` prints `SqlQuery { text, values }`, and `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` and `executeCount()` are methods on their prototype: call them on the query rather than detaching them.
