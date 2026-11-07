# Kysely on MySQL and MariaDB

`createSql(mysql, db)` or `createSql(mariadb, db)`, from `@typesql/core/mysql`. Rows are typed as mysql2's.

**Read back as:**
- `number` is `int`; pin with `{ posts: { price: "decimal" } }` where it matters.
- `bigint` is `bigint`, `string` is `varchar`, `boolean` is `tinyint`, `Date` is `datetime`.
- Objects are `Typed<"json", T>`.

`"db.table"` keys are other databases.
