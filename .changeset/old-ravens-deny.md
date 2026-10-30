---
"@typesql/core": patch
"@typesql/cli": patch
---

Accept TypeScript 7.1 prereleases such as 7.1.0-beta in the peer range, and load TypeScript only when typesql migrate hashes a migration file, so --help works without it.
