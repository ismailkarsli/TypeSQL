---
"@typesql/core": patch
---

Of several missing windows in one expression the first is reported (`count(*) OVER w1 + count(*) OVER w2` was accepted).
