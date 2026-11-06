---
"@typesql/prisma": patch
---

`executor(prisma)` without a `dialect` throws for a Prisma provider other than postgresql, sqlite and mysql, as the `typesql-prisma` generator does, instead of writing PostgreSQL's placeholders. `FromPrisma`, `FromPrismaMysql` and `FromPrismaSqlite` type columns as the dialect's `Col`.
