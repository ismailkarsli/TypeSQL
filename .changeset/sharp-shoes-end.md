---
"@typesql/core": patch
---

DDL errors name relations as PostgreSQL does: a missing schema in `ALTER TABLE`, `DROP TABLE`, `INHERITS` or `LIKE` reports `schema "s" does not exist`, a missing relation there is spelled as written (`relation "public.t" does not exist`), `DROP` / `is not a table` messages use the bare name, and two parents with different column types report `inherited column "x" has a type conflict`.
