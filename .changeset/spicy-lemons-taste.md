---
"@typesql/core": patch
---

With ROLLUP, CUBE, GROUPING SETS or `GROUP BY ()`, a grouped column that some grouping set leaves out is typed nullable (it is NULL in that set's rows; a plain GROUP BY item is in every set and stays non-null), and aggregates are typed as without GROUP BY, since the empty set yields a row even for no input.
