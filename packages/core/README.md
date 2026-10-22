# @typesql/core

Type-level Postgres SQL for TypeScript. You write a SQL string literal; the compiler parses it
**inside the type system** and gives you the exact row type, the parameter types, and (for DDL)
the resulting schema. No codegen, no database connection, no build step. Zero runtime
dependencies.

```sh
pnpm add @typesql/core
```

Add the adapter for your driver to run queries: [`@typesql/pg`](https://www.npmjs.com/package/@typesql/pg)
(node-postgres) or [`@typesql/postgres`](https://www.npmjs.com/package/@typesql/postgres)
(postgres.js). Already describing your database for an ORM? `@typesql/kysely`,
`@typesql/drizzle` and `@typesql/prisma` take the schema from it.

## Usage

```ts
import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";

interface DB {
  users: {
    id: Generated<"int4">; // has a default → optional on INSERT
    email: Col<"text">;
    display_name: Nullable<"text">;
    created_at: Generated<"timestamptz">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
  };
}

const sql = createSql<DB>();

const q = sql(`SELECT u.id, u.email, p.title
               FROM users u LEFT JOIN posts p ON p.author_id = u.id
               WHERE u.id = $1`, 7);
//    ^? Query<{ id: number; email: string; title: string | null }, [number | null]>

q.text;   // the SQL, sent to Postgres as is
q.values; // [7]

sql("SELECT nme FROM users");
//   ~~~~~~~~~~~~~~~~~~~~~~  SqlError<"column \"nme\" does not exist", 1>
```

The SQL must be a string literal (tagged templates cannot be inferred by TypeScript). Values
can be passed positionally (`$1`), by name (`:email` with an object), or inline with
`${sql.param(value)}`; all are sent as bind parameters and checked against their context.

## What you get

- **Rows and parameters** for `SELECT` (joins, subqueries, CTEs, set operations, aggregates,
  window functions) and `INSERT`/`UPDATE`/`DELETE … RETURNING`.
- **Nullability** from the schema, outer joins, `WHERE` filters and expressions (`COALESCE`,
  aggregates, `CASE`).
- **Postgres column naming** (`?column?`, `count`, `lower`) and Postgres-worded compile errors.
- **Fragments**: `sql.fragment`, `sql.id`, `sql.join`, `sql.raw`, spliced into inference with
  `$n` renumbering.
- **DDL**: `ApplyDdl<DB, "ALTER TABLE …">` and the `migrations()` builder derive the schema from
  your migrations.
- **Running queries**: with `createSql(executor)` (or an adapter's `createSql(client)`), queries
  have `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` and `executeCount()` (the
  affected row count). An `Executor` resolves to the rows or to `{ rows, rowCount }`.
- **camelCase rows**: `createSql(executor, { rowKeys: "camelCase" })` renames the rows'
  top-level keys (`created_at` → `createdAt`, as Kysely's `CamelCasePlugin` does) in the types
  and at runtime, leaving JSON values alone.
- **Escape hatch**: `sql.as<Row>(…)` for SQL the engine cannot type.

## Schema

Columns are declared with Postgres type names; a type map turns them into TypeScript types
(`DefaultTypeMap` matches node-postgres: `int8` and `numeric` rows are `string`; their parameters
also take numbers and bigints, and date parameters take `Date | string`):

| Helper | Meaning |
|---|---|
| `Col<"text">` | `NOT NULL`, no default |
| `Nullable<"text">` | `NULL` allowed |
| `Generated<"int4">` | has a default: optional in `INSERT` |
| `NullableGenerated<"text">` | both |
| `Enum<"mood">` | values in `DB["$types"]["mood"]` |
| `View<{ … }>` | read-only relation |

Other Postgres schemas nest (`DB["auth"]["sessions"]` is `auth.sessions`).

## Requirements

TypeScript 7 (the native compiler) and Node.js 26 or later. PostgreSQL semantics only.

## Documentation

[Guide](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/guide/getting-started.md) ·
[API reference](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/reference/api.md) ·
[DDL support](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/reference/ddl.md) ·
[Errors and limits](https://github.com/ismailkarsli/typesql/blob/main/packages/docs/guide/errors-and-limits.md)
