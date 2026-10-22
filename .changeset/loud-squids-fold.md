---
"@typesql/core": patch
"@typesql/pg": patch
"@typesql/postgres": patch
"@typesql/kysely": patch
---

`createSql(executor, { rowKeys: "camelCase" })` (and the adapters' `createSql(client, { rowKeys: "camelCase" })`) camelCases the top-level row keys the way Kysely's `CamelCasePlugin` does, in the row types and in the rows `execute*` and the `query`/`one`/`maybeOne`/`many` helpers return, leaving JSON values untouched.
