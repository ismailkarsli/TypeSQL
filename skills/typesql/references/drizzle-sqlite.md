# Drizzle on SQLite

`createSql(sqlite, db)`, with `sqlite` from `@typesql/core/sqlite`. Works on every Drizzle SQLite driver.

- `integer({ mode: "boolean" })` reads `0`/`1`; `mode: "timestamp"` reads a number.
- `text({ enum })` and `text({ mode: "json" }).$type<T>()` keep their types, with typed JSON paths.
- `generatedAlwaysAs()` columns can't be written.
- Pin a type with `sqliteType(builder, "text")`.
- `drizzle-orm/sqlite-proxy` must return rows as objects.
