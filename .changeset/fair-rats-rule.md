---
"@typesql/pg": patch
"@typesql/prisma": patch
---

Write generated schema columns as Col<type, { nullable: true; hasDefault: true }> instead of the removed Nullable, Generated and NullableGenerated helpers.
