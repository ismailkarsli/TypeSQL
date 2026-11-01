---
"@typesql/core": patch
---

Without `strictNullChecks` (`"strict": true` turns it on), every `sql()` call, migration query and migration `.add()` is an error saying TypeSQL requires it, instead of "Type instantiation is excessively deep" (TS2589), `any` rows and misleading errors.
