---
"@typesql/core": patch
---

The migrator binds MySQL and MariaDB values as `@typesql/mysql` does: a plain object is refused with `cannot bind [object Object] as a MySQL value; use sql.json() for JSON` instead of being written into the statement as SQL text. With a `url`, it also connects with the mariadb connector when mysql2 is not installed.
