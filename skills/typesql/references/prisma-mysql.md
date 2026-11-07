# Prisma on MySQL and MariaDB

`createSql<DB>(mysql, prisma)` or `createSql<DB>(mariadb, prisma)`, from `@typesql/core/mysql`. Prisma connects through `@prisma/adapter-mariadb`.

**Rows:**
- `bigint`: `bigint`, `int unsigned` (`count(*)`).
- `Decimal`: `decimal`.
- `Date`: dates, and `time` on 1970-01-01.
- `JsonValue`: `json`.
- `Uint8Array`: binary, `bit`, spatial.
- `Boolean` columns are numbers.
