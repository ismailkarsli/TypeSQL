---
"@typesql/core": patch
---

DDL that PostgreSQL rejects as a syntax error is rejected too: a dangling dot after a name (`CREATE TYPE a.b.`), a table's clauses after its columns out of PostgreSQL's order or repeated (`INHERITS`, `PARTITION BY`, `USING`, `WITH`, `ON COMMIT`, `TABLESPACE`), `STORAGE` / `COMPRESSION` anywhere but right after a column's type, `INCLUDE` on a column's `PRIMARY KEY` / `UNIQUE`, a trailing comma among enum labels, an unterminated `BEGIN ATOMIC` body or options after its `END`, `ADD PRIMARY` without `KEY`, an index in `CREATE SCHEMA` without `ON table`; `NULL` with `PRIMARY KEY` on a column, `DEFERRABLE` or `[NOT] ENFORCED` on a `NOT NULL` table constraint and `WITH CHECK OPTION` on a recursive view are PostgreSQL's errors, and a bad `LIKE` option is an error instead of `never`.
