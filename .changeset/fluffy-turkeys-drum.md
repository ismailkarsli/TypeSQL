---
"@typesql/core": patch
---

The runtime is smaller: `@typesql/core` is about 2.9 kB minified and gzipped, down from 3.4 kB, with the same API. Some error messages are shorter, and runtime checks that only repeated a type error are gone (`sql.id()` with a non-string, `sql.values()` with a non-array, a prepared query called with the wrong number of parameters, `sql.param(undefined)`). The random marker prefix now always comes from `crypto.randomUUID()`: creating the first `sql.param()`, `sql.json()` or interpolated fragment where Web Crypto is unavailable, such as Cloudflare Workers' global scope, throws instead of falling back to `Math.random()`.
