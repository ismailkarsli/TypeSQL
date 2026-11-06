---
"@typesql/core": patch
"@typesql/mysql": patch
"@typesql/drizzle": patch
---

On the HTTP drivers (TiDB Cloud and PlanetScale serverless), a `'` in a value is written as `''`, so a value cannot end its string on a server with `NO_BACKSLASH_ESCAPES`. Backslashes in values are still corrupted in that mode.
