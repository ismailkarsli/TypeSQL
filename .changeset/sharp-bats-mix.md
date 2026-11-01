---
"@typesql/cli": patch
---

Exit with 0 when `typesql migrate up`, `down` or `latest` succeeds but the schema file can't be written, printing a warning to run `typesql migrate generate` instead of turning the applied migration into a failure on every later run. When the migrations can't import `@typesql/core/migration`, as with pnpm when `@typesql/core` is not a dependency of the project, the error says so and how to add it, and `typesql migrate make` warns about it.
