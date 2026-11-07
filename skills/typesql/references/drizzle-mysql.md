# Drizzle on MySQL and MariaDB

`createSql(mysql, db)` or `createSql(mariadb, db)`, from `@typesql/core/mysql`, on a `drizzle-orm/mysql2` database. For PlanetScale or TiDB Cloud, pass `createSql<typeof schema, ServerlessTypeMap>(mysql, db)`.

- Rows follow mysql2: `boolean` is a number, `count(*)` a `number`, `sum` a `string`.
- `json().$type<T>()` keeps `T`, with typed JSON paths.
- `unsigned` and text sizes aren't in Drizzle's types. Pin them: `mysqlType(int("n", { unsigned: true }), "int unsigned")`.
- `generatedAlwaysAs()` columns can't be written.
- `mysqlSchema()` tables are `db.table`.
