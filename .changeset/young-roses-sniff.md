---
"@typesql/core": patch
"@typesql/pg": patch
"@typesql/mysql": patch
"@typesql/sqlite": patch
"@typesql/prisma": patch
---

`typesql introspect --type-name`, `generateSource({ typeName })` and the Prisma generator's `typeName` reject a name that is not a TypeScript identifier (`typesql introspect` exits with 2) instead of writing a schema file that does not compile.
