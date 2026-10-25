---
"@typesql/core": patch
---

A named function argument keeps its type when the overload is picked (`random(min => 1.5, max => 2.5)` is numeric, it was integer).
