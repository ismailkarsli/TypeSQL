---
"@typesql/core": patch
---

Bit strings (`B'101'`, `X'1F'`) are typed `bit` instead of `text`, and a digit that does not belong is an error (`"2" is not a valid binary digit`), as in PostgreSQL.
