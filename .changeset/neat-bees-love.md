---
"@typesql/core": patch
---

`sql.id(name)` with a generic name constrained to `RelationName<DB>` is typed as every table and view instead of failing, other non-literal names give the usual "dynamic SQL fragment" error, and a fragment whose text is a union now reports an error in any member instead of passing when one member is valid.
