# Kysely on SQLite

`createSql(sqlite, db)`, with `sqlite` from `@typesql/core/sqlite`.

**Read back as:**
- `number` is `numeric`; pin with `{ posts: { id: "integer" } }` where it matters.
- `bigint` is `integer`, `string` is `text`, `Date` is `datetime`.
- A string-literal union is `Typed<"text", …>`.
- Objects are `Typed<"json", T>`.

`"schema.table"` keys are attached databases.
