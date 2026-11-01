---
"@typesql/cli": major
---

`typesql migrate` runs the migrator that `typesql.config.ts` default-exports (`export default createMigrator({ … })` from `@typesql/core/migration`; a plain config object is an error), with the flags applied over it; `typesql migrate status` lists applied and pending migrations, `make` writes `export default migration(previous, { up, down })`, and the `MigrationConfig` type is removed.
