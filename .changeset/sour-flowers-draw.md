---
"@typesql/core": minor
---

Queries can use `MERGE` (`WHEN [NOT] MATCHED [BY SOURCE | BY TARGET]`, `RETURNING` with `merge_action()`, inside `WITH`), `RETURNING old.*` / `new.*` and `RETURNING WITH (OLD AS o, NEW AS n)`, array, `jsonb` and field assignment targets (`SET a[1] = $1`, `INSERT INTO t (c.f)`), `WHERE CURRENT OF` and `SELECT … INTO new_table`, all checked and typed like PostgreSQL 18.
