---
"@typesql/cli": patch
---

`typesql introspect` without `--dialect` or `--url` reads MySQL or MariaDB when `DATABASE_URL` is a `mysql://` or `mariadb://` URL, as for `--url`, instead of connecting to it as PostgreSQL.
