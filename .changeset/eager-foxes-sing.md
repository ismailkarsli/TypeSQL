---
"@typesql/cli": minor
---

`typesql introspect` and `typesql migrate` accept `--dialect mysql` and `--dialect mariadb`. A `mysql://` or `mariadb://` URL selects the dialect by itself, and `DATABASE_URL` is the default URL for MySQL and MariaDB as it is for PostgreSQL. The schema file written after a migration uses `Enum` and `Typed` where the schema has them.
