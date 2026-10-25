---
"typesql": patch
---

Completions in `sql()` strings read more of the statement: a comma after `JOIN … ON …` or `JOIN … USING (…)` offers tables and one after `SELECT DISTINCT ON (…) a` or `ORDER BY a USING <` columns; `INSERT INTO t TABLE` offers tables and `FOR UPDATE` no longer does; `ON CONFLICT (…)` and `RETURNING` offer the target's columns after `INSERT … SELECT … UNION …`; and the columns of a subquery with `DISTINCT ON (…)` or a `{slot} alias` item are read right.
