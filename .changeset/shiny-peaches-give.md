---
"@typesql/core": minor
---

Add `migration(from, run)` to `@typesql/core/migration` for defining a migration's `up` and `down`, as in `export const up = migration(previous, async (db) => …)`: `db` starts from the schema of `from` (`"postgres"` or `"sqlite"` for the first migration, the previous migration's `up` for a later one, the file's own `up` for `down`), and is inferred one file deep, so a history of any length type-checks in the editor and with `tsc`, where `PostgresMigration<MigrationSchema<typeof previousUp>>` reported false errors from about the 29th file. The runner loads a migration's relative `./name.js` import of another migration from `./name.ts`, so migrations import each other without `allowImportingTsExtensions`, and a migration that cannot import `@typesql/core` fails with a hint to add it to the project's dependencies.
