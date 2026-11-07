# Migrations on PostgreSQL

Config: `{ dialect: "postgres", url: process.env.DATABASE_URL, migrationsDir: "./migrations" }`. Install `pg`.

**Own connection:** `execute: executor(client)` with a `pool.connect()` client (`@typesql/pg`) or `await db.reserve()` (`@typesql/postgres`).

**DDL:**
- Changes the schema: tables, views, enums, schemas, `CREATE FUNCTION`.
- Skipped: indexes, sequences, triggers, extensions, grants.
- Not tracked: view dependencies, `search_path`, composite types.

**Transactions:** each migration is atomic, with an advisory lock.
- `CREATE INDEX CONCURRENTLY` and `VACUUM` fail; run that one with `migrator.with({ transaction: false }).up()`.
- A label from `ALTER TYPE … ADD VALUE` is usable only in a later migration.

**Existing database:** introspect it, then start from a baseline:

```ts
import { migration, type PostgresMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: PostgresMigration<Existing>) => db,
	down: async () => {},
};
export const next = migration(baseline, {
	up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```
