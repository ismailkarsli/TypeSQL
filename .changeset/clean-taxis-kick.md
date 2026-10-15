---
"@typesql/core": patch
---

Fix editor completions inside SQL strings taking about a minute and leaving "Type instantiation is excessively deep" (TS2589) in the diagnostics until the language server restarts.
