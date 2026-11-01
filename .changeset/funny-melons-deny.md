---
"@typesql/core": patch
---

Import `@typesql/core` in a Cloudflare Worker's global scope: the random prefix of inline values and fragments is now made on first use, where Workers allow random values, instead of when the module loads, which stopped the Worker from starting.
