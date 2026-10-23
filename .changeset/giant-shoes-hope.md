---
"@typesql/core": minor
---

Parse cursor statements (`DECLARE ... CURSOR FOR query` checks its query and types its parameters; `FETCH`, `MOVE`, `CLOSE`), `END`, `ABORT` and `REASSIGN OWNED`, and more DDL as PostgreSQL 18 does: `CREATE RECURSIVE VIEW`, `CREATE SCHEMA` with embedded elements (applied by `ApplyDdl`), table-level and `ALTER TABLE ... ADD` `NOT NULL col`, `NO INHERIT`, `[NOT] ENFORCED`, `WITHOUT OVERLAPS` keys, `CREATE TABLE ... OF type`, `AS EXECUTE`, any type modifier list and any `PARTITION BY` strategy.
