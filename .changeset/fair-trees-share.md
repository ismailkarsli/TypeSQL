---
"@typesql/prisma": patch
---

The generator writes a MySQL auto-increment column as `Col<"int", { autoIncrement: true }>`, without the `hasDefault: true` that `autoIncrement` implies.
