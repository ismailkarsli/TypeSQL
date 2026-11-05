---
"@typesql/prisma": minor
---

`createSql(mysql, client)` and `createSql(mariadb, client)` run on Prisma Client with `@prisma/adapter-mariadb`, typed by `PrismaMysqlTypeMap` and `PrismaMariaDbTypeMap`. `FromPrismaMysql` converts a Prisma schema, and the `typesql-prisma` generator writes a MySQL schema for the `mysql` provider.
