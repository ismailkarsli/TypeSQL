---
"@typesql/core": patch
---

Reject more SQL that PostgreSQL rejects before running: aggregate and window functions in WHERE, nested aggregates, window calls inside aggregates, true/false/NULL in GROUP BY and ORDER BY, $0, and CASE, COALESCE, GREATEST and LEAST branches whose types cannot be matched.
