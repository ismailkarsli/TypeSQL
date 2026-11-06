---
"@typesql/core": minor
---

`@typesql/core/adapter` holds what the adapters share: connections (`connectPostgres`, `connectMysql`, `connectSqlite`), result normalisers (`pgResult`, `mysqlResult`), value encoders (`jsonText`, `mysqlBind`, `mysqlInline`, `sqliteBindings`), `pooledTransaction`, `createFamilySql`, the schema source writer (`schemaWriter`, `columnSource`, `doc`, …) and the `typesql introspect` shell (`introspectCommand`). `SqlDriver.transaction` also receives, after `client`, `depth` and `fn`, the name of the savepoint to make instead of a transaction of its own (`undefined` when none encloses the client), and a driver's optional `inTransaction(client)` tells that its client is a transaction already; drivers written for 7.0 keep working. A `Dialect` names the lexis of its SQL text (`lexis`). `@typesql/core/migration` exports `loadMigrator`, the config loading of `typesql migrate`.
