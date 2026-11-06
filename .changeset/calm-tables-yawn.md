---
"@typesql/core": patch
---

In PostgreSQL, a cast array parameter such as `$1::text[]` has nullable elements, since it accepts and returns them: `SELECT x FROM unnest($1::text[]) AS x` gives `x: string | null`. A cast parameter that accepts `NULL` makes a column nullable in every `SELECT`; before, the result depended on whether the select list held a `$` or a comment. PostgreSQL migrations accept `CREATE FUNCTION` and `CREATE PROCEDURE` with a `BEGIN ATOMIC … END` body.
