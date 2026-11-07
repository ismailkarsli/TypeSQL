---
name: typesql
description: "Type-checked SQL in TypeScript with TypeSQL (@typesql/*) on PostgreSQL, SQLite, MySQL or MariaDB. Use when a project imports @typesql/* or adds TypeSQL; for sql() queries, createSql, the DB schema type and SqlError compile errors; for migrations and typesql introspect; for raw SQL next to Kysely, Drizzle or Prisma; for Better Auth's typesqlAdapter; and for editor completions."
license: MIT
---

# TypeSQL

The type checker parses `sql("…")` against a `DB` type and infers rows and parameters. At runtime it only builds `{ text, values }`. Needs TypeScript 7.1+ (`7.1.0-beta` works) and `strict`. ESM-only. Docs: <https://typesql.karsli.net>; upgrades: `/guide/upgrading`.

## Read only what matches the stack

All paths are under `references/`. Rules differ per database, so skip the rest.

- **Dialect** (SQL rules, schema types): `dialect-postgresql.md`, `dialect-sqlite.md`, `dialect-mysql.md` (also MariaDB)
- **Driver, no ORM** (setup, row types):
  - `pg`: `adapter-pg.md`
  - postgres.js: `adapter-postgres-js.md`
  - node:sqlite, better-sqlite3, bun:sqlite: `adapter-sqlite.md`
  - mysql2: `adapter-mysql2.md`
  - mariadb: `adapter-mariadb.md`
  - PlanetScale, TiDB Cloud: `adapter-mysql-serverless.md`
  - anything else: `custom-executor.md`
- **ORM** (replaces the adapter file): `kysely.md`, `drizzle.md` or `prisma.md`, plus `<orm>-<postgresql|sqlite|mysql>.md`
- **Migrations:** `migrations.md`, plus `migrations-<postgresql|sqlite|mysql>.md`
- **By task:** `dynamic-sql.md`, `plugins.md` (camelCase), `troubleshooting.md`, `better-auth.md`, `editor.md`

## Verify

Run `tsc --noEmit`; errors land on the SQL string. To see inferred types, add `const probe: never = q;`, read the error, delete it.

## API

```ts
const q = sql(`SELECT id, email FROM users WHERE id = ${sql.param(userId)}`);
const rows = await q.execute(); // also executeTakeFirst, executeTakeFirstOrThrow, executeCount

sql("SELECT id FROM users WHERE id = $1", 7);
sql("SELECT id FROM users WHERE email = :email", { email: "a@b.c" });
```

- `${sql.json(v)}`: value for a JSON column, in place of `sql.param`, not inside it. `null` is SQL `NULL`.
- `sql.param(sql.optional(v))`: `DEFAULT` when `undefined` (not SQLite).
- `sql.set("users", patch)`: `SET` list, skips `undefined` keys.
- `sql.values("users", rows)`: columns and `VALUES`.
- `sql.prepare(text)`: reusable statement.
- `sql.as<Row>(text)`: unchecked escape hatch for SQL TypeSQL can't type.
- `sql.transaction(async (tx) => …)`: commits on resolve, rolls back on throw; `tx` is a bound `sql`; `tx.transaction` is a savepoint. Type shared helpers' argument as `typeof sql`.

Nullability is inferred from outer joins, `WHERE` narrowing through top-level `AND`, aggregates and `coalesce`. Trust it; don't add `!`.

## Gotchas

- `` sql`…` `` is a compile error. It's a function: `` sql(`…`) ``.
- `await sql("…")` compiles but returns the query. Call `execute*`.
- `${value}` or a `string` variable as SQL fails with `the SQL text is not a string literal`. Use `sql.param()`, `sql.id()` or a fragment.
- Placeholders are `$1` on every database; `?` is rejected.
- Schema columns use database type names: `Col<"text">`, not `Col<string>`.
- `createSql` comes from the adapter; `Col` etc. from the dialect module (`@typesql/core/postgres`, `/sqlite`, `/mysql`).
- Row types follow the driver: `count(*)` can be `string`, `number` or `bigint`.
- Alias computed columns, or they get database-chosen names like `?column?`.
- These compile but throw at runtime:
  - reusing a `sql.param()` value in a second statement (a fragment can be reused)
  - `sql.combine([])`, `sql.set(t, {})`, `sql.values(t, [])`
- `sql.set` and `sql.values` write every runtime key. Allowlist untrusted input.
- In a transaction, use `tx` sequentially, not `Promise.all`. On a pool, outer `sql` runs outside the transaction. On one connection, it joins, and a second `sql.transaction()` rejects.
- Don't silence errors with `any` or `@ts-ignore`.
