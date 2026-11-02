---
"@typesql/kysely": patch
---

`executor(db)` uses SQLite's `?` placeholders when `db` is on a SQLite dialect, so it works on SQLite, also with the migrator, without the `{ dialect: "sqlite" }` option.
