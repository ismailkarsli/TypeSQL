---
"@typesql/better-auth": minor
---

`typesqlAdapter(sql, { casing: "snake_case" })` stores Better Auth's tables and columns in snake_case: model names, core fields, `additionalFields` and plugin schemas, so `twoFactor` is `two_factor` and `requirePKCE` is `require_pkce`.
