---
"@typesql/core": patch
---

PostgreSQL: `jsonpath`, `regconfig`, `refcursor`, `pg_snapshot` and `txid_snapshot` values are typed `string`, as node-postgres and postgres.js return them, instead of `unknown`.
