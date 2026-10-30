---
"@typesql/core": patch
---

Type NUMERIC-affinity SQLite columns (numeric, decimal, boolean) as number | bigint under BigIntTypeMap, since bigint mode returns their integral values as bigint.
