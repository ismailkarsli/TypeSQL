---
"@typesql/core": minor
---

Any operator Postgres can lex is accepted: user-defined and geometric operators such as `*=`, `~<~`, `|>>` or `@-@`, prefix operators like `@@ box` and `OPERATOR(schema.op) x`; built-in geometric tests type as `boolean`, unknown operators as `unknown`.
