# Prisma on PostgreSQL

`createSql<DB>(postgres, prisma)`, with `postgres` from `@typesql/core/postgres`.

**Rows:**
- `bigint`: `int8` (`count(*)`), `oid`.
- `Decimal`: `numeric`, `money`.
- `Date`: dates and times.
- `Uint8Array`: `bytea`.
- `JsonValue`: `json`.

`interval`, geometric types and ranges throw "Unsupported column type"; cast with `::text`. Arrays of enums stay raw `{…}` text; cast with `::text[]`.
