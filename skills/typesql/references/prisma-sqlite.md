# Prisma on SQLite

`createSql<DB>(sqlite, prisma)`, with `sqlite` from `@typesql/core/sqlite`.

**Rows** convert by declared type:
- `Date`: `datetime`.
- `bigint`: `bigint`.
- `Decimal`: `decimal`.
- `boolean`: `boolean`.
- `JsonValue`: `Json`.

**Computed columns have no declared type, so runtime differs from the types:** `max(created_at)` is a string though typed `Date`, and `count(*)`, `length()` and `max(id)` are `bigint` though typed `number`. Use `Number()` or `CAST(… AS REAL)`.
