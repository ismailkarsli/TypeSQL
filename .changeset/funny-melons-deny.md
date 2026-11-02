---
"@typesql/core": patch
---

Start a Cloudflare Worker that imports `@typesql/core`, or builds a query with `sql.param()` or a fragment in its global scope: the random prefix of inline values and fragments is now made on first use instead of when the module loads. A first use in global scope, where Workers forbid `crypto.getRandomValues()`, takes `Math.random()`'s values, and the first use in a handler switches to a prefix from crypto.
