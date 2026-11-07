# Migrations on SQLite

Config: `{ dialect: "sqlite", db: "./app.db", migrationsDir: "./migrations" }`. `db` opens with node:sqlite.

**Own connection:** `execute: executor(database)` from `@typesql/sqlite`, for better-sqlite3 and bun:sqlite.

**Transactions:** `BEGIN IMMEDIATE` per migration, atomic. `db` waits 30 seconds for another writer.

**D1 and libsql** reject `BEGIN`/`COMMIT`: set `transaction: false`, which means no lock and no rollback, so run from one place only. D1 needs array mode and `positional`:

```ts
import { positional } from "@typesql/core/adapter";
import { createMigrator } from "@typesql/core/migration";

export const migrator = (env: { DB: D1Database }) =>
	createMigrator({
		dialect: "sqlite",
		migrations: [createUsers],
		transaction: false,
		execute: async (text, values) => {
			const query = positional(text, values);
			return (await env.DB.prepare(query.text).bind(...query.values).all()).results;
		},
	});
```

**Existing database:** introspect it, then start from a baseline typed `SqliteMigration<Existing>`:

```ts
import type { SqliteMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: SqliteMigration<Existing>) => db,
	down: async () => {},
};
```
