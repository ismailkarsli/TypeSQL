---
"@typesql/core": patch
---

Accept a slot holding a union of fragments with different parameter counts, such as flag ? sql.fragment("AND id = $1", 1) : sql.fragment("AND true"), by checking each fragment with its own parameters.
