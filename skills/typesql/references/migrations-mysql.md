# Migrations on MySQL and MariaDB

Config: `{ dialect: "mysql", url: process.env.DATABASE_URL, migrationsDir: "./migrations" }`, or `"mariadb"`. Install `mysql2`; the URL names the database.

**Own connection:** `execute: executor(connection)` from `@typesql/mysql`, with a dedicated `createConnection` connection.

**No atomic rollback.** DDL commits implicitly, so a failed migration keeps its earlier DDL and reports `rolledBack: false`. Keep to one DDL statement per migration, or make statements re-runnable. A `GET_LOCK` is held for the run.

**DDL:**
- Aliases resolve to the stored type: `INTEGER` is `int`, `BOOL` is `tinyint`, `SERIAL` is `bigint unsigned` with `AUTO_INCREMENT`.
- `CREATE TRIGGER`, `PROCEDURE`, `FUNCTION` and `EVENT` skip the rest of the text, so give each its own `.ddl()`.
- `FIRST`/`AFTER` drop column positions.

**Existing database:** introspect it, then start from a baseline typed `MySqlMigration<Existing>` or `MariaDbMigration<Existing>`:

```ts
import type { MySqlMigration } from "@typesql/core/migration";
import type { DB as Existing } from "./db/schema.js";

export const baseline = {
	up: async (db: MySqlMigration<Existing>) => db,
	down: async () => {},
};
```
