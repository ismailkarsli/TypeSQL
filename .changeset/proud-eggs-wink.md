---
"@typesql/prisma": patch
---

`executor(prisma)` uses SQLite's `?` placeholders when the client's provider is SQLite, so it works on SQLite, also with the migrator, without the `{ dialect: "sqlite" }` option.
