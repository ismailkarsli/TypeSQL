---
"@typesql/kysely": minor
---

`@typesql/kysely` exports `driverOf`, so `createTransactionalSql(postgres, db, driverOf("postgres"))` runs on Kysely with a TypeSQL schema, such as one from `typesql introspect`, without `FromKysely`.
