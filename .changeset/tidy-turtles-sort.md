---
"@typesql/core": minor
---

A declared PostgreSQL function in `FROM` has the columns of the table or view its return type names (all nullable unless it is `srf: true`), or the ones its new `columns` flag lists for `RETURNS TABLE (...)`. Before, `SELECT * FROM f() x` was typed `{ x: unknown }`; a declared function returning `record` without `columns` is now the error PostgreSQL gives, and `CREATE FUNCTION ... RETURNS TABLE` in migrations records its columns.
