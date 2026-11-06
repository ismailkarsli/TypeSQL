---
"@typesql/kysely": patch
"@typesql/drizzle": patch
---

On MySQL and MariaDB, values are bound as `@typesql/mysql` binds them: a plain object is refused with `cannot bind [object Object] as a MySQL value; use sql.json() for JSON` instead of being written into the statement as SQL text.
