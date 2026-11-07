# Migrations

Checked DDL whose resulting schema is a type. Examples use PostgreSQL; see your database's file. Pick one mode:

- **Directory + CLI** (default; Node 26+): generates `db.ts`.
- **Array:** no file system (Workers, Bun, Deno); no generated file.

## Directory

Needs `@typesql/core` as a direct dependency and `@typesql/cli` as a dev dependency. `typesql.config.ts` default-exports `createMigrator({ … })`.

`typesql migrate make "add bio"`, fill it in, then `tsc --noEmit`, then `typesql migrate latest`. Import `DB` from the generated `db.ts`. Also: `up`, `down`, `status`, `generate` (no database). Flags: `--config`, `--dialect`, `--url`, `--db`, `--dir`, `--out`, `--no-generate`.

```ts
import { migration } from "@typesql/core/migration";
import previous from "./1793356800_create-users.js"; // .js resolves to the .ts

export default migration(previous, {
	up: async (db) => {
		const next = await db.ddl("ALTER TABLE users ADD COLUMN bio text");
		await next("UPDATE users SET bio = $1", "").execute();
		return next;
	},
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
```

## Array

```ts
import { createMigrator, migration, type SchemaOf } from "@typesql/core/migration";

export const createUsers = migration("postgres", {
	name: "create-users",
	up: async (db) => db.ddl("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)"),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});

export type DB = SchemaOf<typeof createUsers>;

export const migrator = createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [createUsers],
});
// await migrator.latest();
```

Write the array in the call or declare it `as const`, or the schema can't be inferred.

## Rules

- The first migration starts from `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"`.
- `.ddl()` returns a new context. Chain it in `up` and `down` alike, and return the last one from `up`.
- `down` is required.
- DDL leaves JSON columns untyped. Layer `Json<T>` over the schema: `Omit<SchemaOf<typeof m>, "orders"> & { orders: … }`.
- Await everything before returning.
- `.raw<NewSchema>(sql)` runs unchecked SQL.
- Never edit, remove, rename or reorder applied migrations: history records names, not contents.
- No `BEGIN`/`COMMIT`/`ROLLBACK` inside; the runner owns the transaction.
- `execute` needs one dedicated connection, not a pool.
- Production without `typescript`: `generate: false` or `--no-generate`.

Failure rejects with `MigrationError` `{ migration, applied, rolledBack, cause }`; earlier migrations stay applied.
