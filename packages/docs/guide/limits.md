# Limits

TypeSQL runs inside the TypeScript compiler, so it works within the compiler's budgets. This page lists what it can't do, or does only in part, and what to do instead.

When you hit a limit, [`sql.as<Row>()`](./errors#when-typesql-can-t-type-a-statement) lets you state the row type yourself.

## Toolchain

- TypeSQL needs TypeScript 7.1 or later (the native compiler; `7.1.0-beta` works).
- It models PostgreSQL and SQLite. MySQL is planned. SQLite's own limits are listed in [SQLite](./sqlite#limits).
- The editor completions ([VS Code](./vscode), [Neovim](./neovim)) use APIs that are new in TypeScript 7.1 and may still change before 7.1 is final.

## Statement size

- The lexer handles up to 4096 tokens per statement (a generated table in the [engine](./type-engine) sets this), but some shapes hit TypeScript's own depth limits well before that. Measured with TypeScript 7.1 (tsrs gives the same results):

  | Construct | Largest that compiles |
  |---|---|
  | `a \|\| a \|\| …`, `a + a + …` | about 85 terms |
  | select list of `id + n AS cn` | about 300 columns (~1800 tokens) |
  | nested derived tables (`FROM (SELECT … FROM (…))`) | 11 levels |
  | `UNION ALL` branches | 42 |
  | `IN (1, 2, …)` items, multi-row `VALUES` rows | about 1000 |

  `AND`/`OR` chains (the parser balances them), 20 joins, 20 CTEs and a `CASE` with 150 branches are fine. The [benchmark](./performance#compile-time) checks statements up to 8 KB.
- Past these sizes the compiler reports its own error instead of a SQL error: TS2589 ("Type instantiation is excessively deep and possibly infinite"), TS5114 or TS5115. Split the statement, or give its row type with [`sql.as<Row>()`](./dynamic-sql#fully-dynamic-sql), which skips the analysis.
- In `migrations()`, keep one migration per `.add()`: one text is limited to about 4000 tokens, and past that the error is a raw TS2589.

## SQL text

- Only literal SQL is analysed: a string literal, or a template literal whose substitutions are compile-time constants. Anything else is an error; see [Parameters](./parameters).
- Tagged templates (`` sql`…` ``) are not supported, because TypeScript does not expose their text to the type system.
- Mixing `:name` and `$n` parameters in one statement is an error.
- A colon directly followed by a name is a [named parameter](./parameters#named-name), also in an array slice: `a[1:n]` is `a[1$1]`. Write `a[1: n]` for a slice up to the column `n`.

## Fragments and lists

- [`sql.combine` over an array](./dynamic-sql#lists-from-runtime-arrays) checks the statement once, with every distinct element once. Its cost grows with the number of distinct elements, not with the number of combinations (80 distinct sort elements cost about 0.2M instantiations).
- In a select list (`SELECT {cols}`), such a list counts every element as selected.
- A fragment whose text is a union (`sql.id(name)` with `name: "a" | "b"`) is checked once per member. So two such slots in one statement cost `n × m` checks. A generic `sql.id` over `RelationName<DB>` checks the statement against every table and view. For lists, use `sql.combine` over an array, which costs one check.
- `sql.set` and `sql.values` are checked like `sql.combine` over an array, with every key of the input type once.
- Some calls throw at runtime because the database would reject the SQL: `sql.combine` with no items, `sql.set` with no defined value, and `sql.values` with an empty array or several rows without values. A `sql.param()` value also throws when it is used in a second statement; wrap a reused value in a fragment.

## Defaults and generated columns

The schema does not tell identity `GENERATED ALWAYS` columns apart from other columns with a default. So writing one is accepted, though Postgres rejects it without `OVERRIDING SYSTEM VALUE`. The [DDL reference](../reference/ddl#limitations) lists the other DDL limits.

## JSON

- Typed JSON (see [JSON](./queries#json)) needs literal keys and paths. `json_build_object(col, …)` or `-> $1` on an object gives plain JSON, or the union of all members.
- Only the string literals `'[]'`, `'{}'`, `'null'`, `'true'` and `'false'` keep their value when they meet typed JSON (`coalesce(json_agg(x), '[]')`). Any other literal makes the result `unknown`.
- Functions that rewrite JSON (`jsonb_set`, `||`, `jsonb_strip_nulls`, `json_populate_record`, `jsonb_path_query`, `json_each`) return plain JSON. So does `row_to_json(ROW(…))`.
- A [`Json<T>` column](./schema#typed-json-columns)'s `T` is trusted, not checked against the database. Positional and named parameters for it are typed `T` but passed to the driver as they are; only `sql.json()` makes arrays work with node-postgres.
- A `sql.json(value)` value is checked for its JSON kind (object, array, string, number, boolean or null), not against a `Json<T>` column's `T`, wherever it is used: inline, as an argument, in `sql.set` / `sql.values` or in a fragment. A raw object passed as a positional or named argument is checked against `T`. Likewise `sql.param(value)` is checked by kind only: any string is accepted for an enum column and any object for a typed JSON column.
- A plain `jsonb` parameter (typed `unknown`) refuses objects with a `length` key. Wrap those in `sql.json()`.
- Inside JSON, `int8` and `numeric` are numbers. `JSON.parse` rounds integers beyond 2^53, and a `float8` / `numeric` that is `NaN` or `Infinity` is serialized as a string.
- Elements of Postgres arrays are typed non-null, as for array columns.
- In `JSON_OBJECT`, write pairs as `k VALUE v` or `k: v`. In `k:v`, the `:v` is read as a [named parameter](./parameters#named-name) when `v` is a name.

## Types and hovers

- Editor hovers list a row's keys in alphabetical order, because TypeScript 7 orders the keys of computed object types. The rows the driver returns keep the `SELECT` order.
- A whole-row reference (`to_json(t)`, `(t).*`) is nullable when all of the row's columns are, since that is how the outer side of a join looks. So a table whose columns are all nullable is typed as a nullable row, even when it is not joined.
- Some results can't be known statically: rows of `FETCH` (the cursor is declared in another statement) and results of user-defined operators (`unknown`).
- With [`CasePlugin`](./queries#camelcase-row-keys), two columns that map to the same key (`user_id` and `"userId"`) are typed as the union of both; at runtime the later one wins. Alias one of them to keep both.
- Some driver types differ from their row type at runtime, such as `numeric[]` under node-postgres. See [Type mapping](../reference/type-mapping#node-postgres).

## ORM schemas

The Kysely and Prisma limits are on their sections of [From Kysely, Drizzle or Prisma](./orms). For Drizzle:

- Generated-always columns count as having a default. Postgres rejects an `INSERT` that sets one, but TypeSQL doesn't.
- `$onUpdate` columns look like they have a default, so `INSERT` doesn't require them.
- `.$type<T>()` is ignored; rows use the type map (`jsonb().$type<T>()` is `unknown`).
- `text({ enum: [...] })` is plain `text`: in Drizzle, those values are only a TypeScript constraint.

On SQLite, `text({ enum })` and `text({ mode: "json" }).$type<T>()` keep their types, because SQLite has no enum or JSON type to tell apart. With Prisma on SQLite, a computed column (`max(created_at)`) has no declared type, so Prisma returns SQLite's raw value (a string) where TypeSQL says `Date`; cast or convert it.

## Unsupported syntax

Unsupported syntax is always a compile error, never a silent `any`. Notable gaps:

- tracking which views depend on which tables;
- column alias lists on plain tables.
