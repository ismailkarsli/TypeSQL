---
"@typesql/core": major
---

Remove the Arr, Nullable, Generated and NullableGenerated schema helpers: write Col<"int4[]">, Col<"text", { nullable: true }>, Col<"int4", { hasDefault: true }> and Col<"text", { nullable: true; hasDefault: true }> instead.
