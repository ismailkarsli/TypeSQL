---
"@typesql/core": patch
---

A column assigned twice is rejected as in PostgreSQL: `column "c" specified more than once` in an INSERT or MERGE INSERT column list (assigning several of its elements or fields stays allowed), `multiple assignments to same column "c"` in an UPDATE, ON CONFLICT DO UPDATE or MERGE SET list; an UPDATE … FROM or DELETE … USING that reuses the target's name is `table name "t" specified more than once`.
