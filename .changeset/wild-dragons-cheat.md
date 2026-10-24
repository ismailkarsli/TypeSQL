---
"@typesql/core": patch
---

`U&'…' uescapeé` (UESCAPE followed by a non-ASCII letter) reads as an alias, as in PostgreSQL, instead of an error.
