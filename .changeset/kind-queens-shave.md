---
"@typesql/pg": minor
---

`createSql<DB, TM>()` takes a type map for a client with its own type parsers, such as one that parses `int8` to `bigint`, `PgSql` takes it as its third type argument, and `driver` is exported for `createTransactionalSql`.
