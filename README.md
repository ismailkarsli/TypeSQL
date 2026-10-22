# typesql

Type-level Postgres SQL for TypeScript. You write a SQL string literal; the compiler parses
it **inside the type system** and gives you the exact row type, the parameter types, and
(for DDL) the resulting schema. No codegen, no database connection, no build step.

![typesql demo: hovering a query shows its inferred row type, and a misspelled column is a compile error](assets/demo.gif)

```ts
import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";

interface DB {
  users: {
    id: Generated<"int4">;          // has a default → optional on INSERT
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
//    ^? Query<{ id: number; email: string; title: string | null }, [number]>

// values inline, sent as $n parameters and type-checked against their context
sql(`SELECT id FROM users WHERE email = ${sql.param(email)} AND id > ${sql.param(10)}`);

sql("SELECT nme FROM users");
//   ~~~~~~~~~~~~~~~~~~~~~~  Argument of type '"SELECT nme FROM users"' is not assignable to
//                           parameter of type 'SqlError<"column \"nme\" does not exist", 1>'
```

The runtime is a thin object `{ text, values }`; `@typesql/pg` and `@typesql/postgres` run it.
Already using Kysely, Drizzle or Prisma? `@typesql/kysely`, `@typesql/drizzle` and
`@typesql/prisma` take the schema from it.

```ts
import { createSql, query, one } from "@typesql/pg";   // pre-bound to pg's type map
const rows = await query(pool, q);                   // Promise<{ id: number; ... }[]>

const db = createSql<DB>(pool);                      // or bind the pool: queries run themselves
const user = await db("SELECT id, email FROM users WHERE id = $1", 7).executeTakeFirstOrThrow();
```

## Packages

| Package | Role | Peer dependency | Contents |
|---|---|---|---|
| [`@typesql/core`](packages/core) | type engine | none | `createSql`, `q.execute()`/`executeTakeFirst()`/`executeTakeFirstOrThrow()`, fragments, `ApplyDdl`, `migrations()`. Zero dependencies. |
| [`@typesql/pg`](packages/pg) | driver | `pg` ≥ 8 | node-postgres: `PgTypeMap`, `createSql(pool?)`, `executor`, `query`/`one`/`maybeOne`/`many`/`execute`/`transaction` |
| [`@typesql/postgres`](packages/postgres) | driver | `postgres` ≥ 3 | postgres.js: the same API, with `PostgresJsTypeMap` and `PostgresJsBigIntTypeMap` |
| [`@typesql/kysely`](packages/kysely) | ORM schema | `kysely` ≥ 0.27 | `FromKysely`: a Kysely `DB` interface (kysely-codegen, prisma-kysely) as the schema; `query`/`execute` through Kysely |
| [`@typesql/drizzle`](packages/drizzle) | ORM schema | `drizzle-orm` ≥ 0.45 | `FromDrizzle`: Drizzle `pgTable`/`pgView`/`pgEnum`/`pgSchema` definitions as the schema; `pgType` |
| [`@typesql/prisma`](packages/prisma) | ORM schema | `@prisma/client` ≥ 7 | the `typesql-prisma` generator and `FromPrisma`; `queryRaw`/`executeRaw` through Prisma Client |

Two more workspace packages are private and not published: `@typesql/docs` (the VitePress
documentation site) and `@typesql/bench` (compile-time budget benchmarks).

## What is inferred

| Feature | Status |
|---|---|
| SELECT: joins (nullability per join kind, USING/NATURAL), aliases, `*`/`t.*`, WHERE, GROUP BY/HAVING, ORDER BY, LIMIT/OFFSET/FETCH, DISTINCT [ON], FOR UPDATE | ✓ |
| Subqueries (scalar, EXISTS, IN, ANY/ALL), derived tables, LATERAL, CTEs incl. RECURSIVE, UNION/INTERSECT/EXCEPT, VALUES, set-returning functions in FROM | ✓ |
| Expressions: operators with numeric/date/JSON/array rules, casts, CASE, COALESCE/NULLIF/GREATEST/LEAST, IS, BETWEEN, IN, LIKE, arrays, subscripts, EXTRACT and friends, window functions | ✓ |
| Function catalog (string, numeric, date/time, JSON, arrays, aggregates, window) with Postgres nullability; unknown functions are `unknown` (a cast fixes it); extensible via `FunctionCatalog` augmentation | ✓ |
| Parameters: `$n` typed from context (`WHERE id = $1` → `number`), `:name` sugar, inline `${sql.param(value)}` with value type checks | ✓ |
| Nullability narrowing: `WHERE c IS NOT NULL` / comparisons / inner-join conditions make `c` non-null | ✓ |
| Errors with token positions and "Perhaps you meant …" hints for unknown columns and relations | ✓ |
| INSERT/UPDATE/DELETE with RETURNING, required-column checks, ON CONFLICT, `EXCLUDED` | ✓ |
| DDL → schema: `ApplyDdl<DB, "ALTER TABLE …">`, `migrations()` builder, views, enums, schemas | ✓ |
| Fragments: `{slot}` splicing with `$n` renumbering, `sql.fragment`, `sql.id`, `sql.join`, `sql.raw`; dynamic text falls back to `sql.as<Row>()` | ✓ |
| Postgres output column naming (`?column?`, `count`, `case`, `btrim`, casts → type name, last duplicate wins) | ✓ |

Unsupported syntax is a compile error with a Postgres-style message and a token position,
never a silent `any`.

## Schema

Columns are declared with **Postgres type names** so expression typing can follow Postgres
rules; the adapter's type map converts to TS types at the boundary (`int8` is a `string`
under `pg`, a `bigint` under postgres.js with bigint parsing).

```ts
interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; mood: Enum<"mood"> };
  user_stats: View<{ user_id: Col<"int4">; n: Col<"int8"> }>;
  auth: { sessions: { token: Col<"uuid"> } };    // nested schema: auth.sessions
  $types: { mood: "happy" | "sad" };              // enum registry
}
```

Or derive the schema from migrations:

```ts
const m = migrations()
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN display_name text");
type DB = SchemaOf<typeof m>;
```

## Toolchain and limits

Requires TypeScript ≥ 7.0 (the native compiler) and Node ≥ 26. The engine is written to
TypeScript's recursion budgets. Measured on TS 7.0.2:

| Workload | Cost |
|---|---|
| typical 60-token query (join, GROUP BY, two parameters) | ~28K instantiations |
| 100 simple queries in one file (`SELECT a, b FROM t WHERE a = $1` shape) | ~0.7 s check time |
| 100 distinct 60-token queries in one file | ~1.6–2.4 s check time |
| 8 KB statement | checks, ~1.3 s |

Known ceilings: statements up to 4096 tokens; left-nested `||` or `+` chains of ~100 terms
(`AND`/`OR` chains are balanced by the parser and are fine at 200+ terms). Past a ceiling,
use `sql.as<Row>()`.

Hovers show row keys in alphabetical order: TypeScript 7 orders the keys of computed object
types. The runtime row objects keep the SELECT order.

The documentation site lives in `packages/docs` (VitePress): run `pnpm docs:dev` to browse it
locally. Its pages pull their code examples from type-checked files, so they read best on the
site; the Markdown sources are the [guide](packages/docs/guide/getting-started.md),
the [API reference](packages/docs/reference/api.md), [DDL support](packages/docs/reference/ddl.md),
[adapters](packages/docs/guide/adapters.md), [ORM schemas](packages/docs/guide/orm-schemas.md)
and the [type engine](packages/docs/internals/engine.md).

## Development

```sh
pnpm install
pnpm typecheck         # tsc per package
pnpm test              # vitest: runtime + type tests; conformance runs against docker postgres:17 when available
pnpm build && pnpm smoke:dist   # import the built packages with plain Node
pnpm docs:dev                   # the documentation site (packages/docs)
node packages/bench/gen.mjs && node packages/bench/run.mjs   # compile-time budget (thresholds.json)
TYPESQL_PG_URL=… node scripts/catalog-from-pg.mjs              # review the function catalog against pg_proc
```
