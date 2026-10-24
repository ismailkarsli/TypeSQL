---
"@typesql/core": patch
---

A JSON step that misses (`x -> 'nope'`, an index past the end, a key on an array) is SQL NULL, so `coalesce(x -> 'nope', '[]')` is typed `[]` instead of `[] | null`.
