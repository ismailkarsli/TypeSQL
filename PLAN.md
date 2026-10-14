# typesql — type-level Postgres SQL helper for TypeScript

A zero-build-step SQL helper. You hand it a SQL string literal and a schema type; it
parses the SQL **inside the TypeScript type system** and gives you the exact row type,
the parameter types, and (for DDL) the resulting schema. Runtime is a thin object
`{ text, values }` plus small adapters for `pg` and `postgres.js`.

Status: planning. Nothing is implemented yet.

---

## 1. Decisions taken (from the Q&A)

| Topic | Decision |
|---|---|
| Inference | Type-level, compile time. No codegen, no DB connection, no build step. |
| Dialect | PostgreSQL only. Postgres semantics are the spec (identifier folding, column naming, 3-valued NULL logic, driver type parsing). |
| Schema source | A TypeScript interface the user declares. DDL statements can **evolve** that type (`ApplyDdl<DB, "ALTER TABLE ...">`), so a schema can also be derived from a chain of typed migrations. |
| Coverage | Everything: SELECT (joins, subqueries, CTEs, set ops, aggregates, window functions), INSERT/UPDATE/DELETE with RETURNING, and DDL. Unsupported syntax is a compile error, never silent. |
| Runtime | Pure type layer. Core has zero dependencies. Thin adapters: `@typesql/pg`, `@typesql/postgres`. |
| Parameters | Typed from context: `WHERE id = $1` requires `number`; INSERT value slots require the column type. |
| Nullability | Full: schema NOT NULL, outer-join nullability, expression rules (COALESCE, aggregates, CASE, scalar subqueries). |
| Failure mode | Readable compile error (`SqlError<"...">`) **plus** an explicit override (`sql.as<Row>(...)`) to bypass inference for one statement. |
| Expressions | Common operators, casts, and a curated function catalog. Unknown functions yield `unknown` (a cast fixes it). Catalog extensible via module augmentation. |
| API | Factory: `const sql = createSql<DB>()`, with an optional type-map parameter. |
| Type map | Configurable `createSql<DB, TypeMap>()`. Defaults ship with each adapter so `COUNT(*)` is `string` under `pg` and `bigint` under `postgres.js` with bigint parsing. |
| Fragments | Typed, spliced into inference. `sql.id`, `sql.join`, `sql.raw`. Dynamic fragments degrade to the override path. |
| Namespaces | Flat `DB` interface resolves `users` and `public.users`. Optional nested `DB["auth"]["users"]` for other schemas. |
| Toolchain | Latest only: TypeScript 7.x native compiler (7.0 shipped 2026-07-08; 7.1 is due ~Nov 2026 and only adds the programmatic API, which core does not need), Node 26+, pnpm, vitest. |
| Repo | pnpm monorepo: `packages/core`, `packages/pg`, `packages/postgres`, `packages/bench`. |

## 2. Two facts that reshape the API

### 2.1 Tagged templates cannot be inferred (TypeScript #33304, still open)

`sql\`SELECT ...\`` gives the tag function a `TemplateStringsArray`, which is **not**
generic over its literal parts. The compiler discards the text, so no type-level parser
can see it. PR #45310 that would fix this was closed in 2021; the issue is still
"In Discussion" as of 2026.

Consequence: the inference entry point is a **plain function call with a string literal**.

```ts
const sql = createSql<DB>();

const q = sql("SELECT id, name FROM users WHERE id = $1", 42);
//    ^? Query<{ id: number; name: string }, [number]>
```

Postgres-native `$1..$n` placeholders are used as-is, so the text goes to the driver
untouched. Named params (`:id`) can be added later as sugar that rewrites to `$n`.
Editor SQL highlighting still works via `sql(/* sql */ "...")` or extension settings
that match the call name.

### 2.2 TypeScript 7 is a faster compiler with the same limits

TS 7 is a Go port with identical type-system semantics. The recursion budgets are
unchanged (≈500 instantiation depth, 1000 tail-recursive iterations per conditional
type, 5M total instantiations per check), but evaluation is ~10× faster. That makes
heavy type-level parsing viable in the editor, but the **grammar engine must still be
written to those limits**: token-level (not char-level) scanning, tail-recursive
loops, and chunked recursion to reset budgets. Milestone 0 measures this empirically.

## 3. Architecture

```
   string literal  ──►  Lexer  ──►  Parser  ──►  Binder  ──►  Typer  ──►  Projector
   (type param Q)       tokens      AST         scopes       expr types   Row / Params /
                                                 + null-      per node     SchemaDelta
                                                 ability
```

All five stages are **types**, living in `packages/core/src/engine/**`. They never run
at runtime. The runtime side is a few hundred lines: build `{ text, values }`, splice
fragments, renumber `$n`.

Every stage returns either a success tuple or `SqlError<Message, Position>`. Errors
propagate unchanged, so the first failure surfaces to the user with the original
message.

## 4. Public API (core)

```ts
import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";

interface DB {
  users: {
    id: Generated<"int4">;              // has a default / identity → optional on INSERT
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

const sql = createSql<DB>();              // uses the default type map
// const sql = createSql<DB, PgTypeMap>(); // or an adapter's map

// SELECT
const q1 = sql(`SELECT u.id, u.email, p.title
                FROM users u LEFT JOIN posts p ON p.author_id = u.id
                WHERE u.id = $1`, 7);
// Query<{ id: number; email: string; title: string | null }, [number]>

// Expressions, aliases, aggregates
const q2 = sql(`SELECT author_id, count(*) AS n, max(title)
                FROM posts GROUP BY author_id`);
// Query<{ author_id: number; n: string /* int8 under pg */; max: string }, []>

// DML with RETURNING, insert slots typed from the column
const q3 = sql(`INSERT INTO users (email, display_name) VALUES ($1, $2)
                RETURNING id`, "a@b.c", null);
// Query<{ id: number }, [string, string | null]>

// DDL evolves the schema
type DB2 = ApplyDdl<DB, "ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0">;

// Migrations as the schema source
const m = migrations()
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN display_name text");
type DBFromMigrations = typeof m.schema;

// Escape hatch: inference bypassed, row type asserted
const q4 = sql.as<{ id: number }>("SELECT id FROM some_lateral_monster(...)", 1);

// Fragments
const where = sql("WHERE u.id = $1", 7);
const q5 = sql("SELECT u.id FROM users u {where}", { where });
// text: "SELECT u.id FROM users u WHERE u.id = $1", values: [7]
```

Query object shape:

```ts
interface Query<Row, Params extends unknown[]> {
  readonly text: string;          // final SQL with $n renumbered after splicing
  readonly values: unknown[];     // params in order
  readonly [ROW]?: Row;           // phantom
  readonly [PARAMS]?: Params;     // phantom
}
```

Adapters:

```ts
import { query, one, maybeOne } from "@typesql/pg";
const rows = await query(pool, q1);         // Promise<{ id: number; ... }[]>
const row  = await one(pool, q3);           // throws if not exactly one
```

### Error presentation

The `query` parameter is typed as `Q & Validate<DB, Q>`. On success `Validate` is `Q`.
On failure it is `SqlError<"column \"nme\" does not exist in \"users\"", 22>`, so
the error lands on the string literal argument and reads like a Postgres error:

```
Argument of type '"SELECT nme FROM users"' is not assignable to parameter of type
  'SqlError<"column \"nme\" does not exist in table \"users\"", 7>'.
```

## 5. Schema representation

Columns are declared with **Postgres type names**, not TS types. Reason: expression
typing (numeric promotion, `int8` arithmetic, date math, casts) needs SQL types, and the
TS type is driver-dependent. The type map converts to TS at the projection boundary.

```ts
type Col<T extends PgTypeName, Flags = {}> = { type: T; nullable: false; hasDefault: false } & Flags;
type Nullable<T>  = Col<T, { nullable: true }>;
type Generated<T> = Col<T, { hasDefault: true }>;   // serial/identity/DEFAULT
type Arr<T>       = Col<`${T}[]`>;
type Enum<Name, Values extends string> = ...;        // CREATE TYPE ... AS ENUM
```

Type names are normalized on entry: `integer`/`int` → `int4`, `bigint` → `int8`,
`boolean` → `bool`, `character varying(n)` → `varchar`, `double precision` → `float8`,
`timestamp with time zone` → `timestamptz`, `serial` → `int4` + hasDefault, etc.

Views appear in the schema as read-only tables (`View<{...}>`), so `CREATE VIEW` can
add them and `INSERT INTO view` is an error.

Nested schemas: `interface DB { auth: { users: {...} } }` is recognized when a key's
value is itself a table map rather than a column map. Unqualified names and `public.x`
resolve against the top level.

A plain-TS-type schema (`id: number`) is **not** in v1; it can be offered later via a
lossy reverse map if demand appears.

## 6. Type engine design

### 6.1 Lexer

Input: the string literal `Q`. Output: a tuple of tokens
`[{ k: "ident"; v: "users"; p: 12 }, { k: "kw"; v: "FROM" }, { k: "param"; n: 1 }, ...]`.

- One token per recursion step, never one character. Identifiers, numbers, and
  whitespace runs are consumed with a single `infer` against a delimiter set.
- Token kinds: keyword (case-insensitive match, stored uppercase), identifier
  (unquoted → lowercased, quoted `"X"` → preserved), number, string `'...'` with `''`
  escape, dollar-quoted `$$...$$` (DDL function bodies), `$n` param, operator
  (longest-match: `::`, `->>`, `#>>`, `@>`, `<@`, `?|`, `?&`, `!~*`, `||`, `<=`, `>=`,
  `<>`, `!=`, ...), punctuation, comments `--` and `/* */` (skipped).
- Positions are kept for error messages.
- Budget: an outer loop restarts the inner lexer every N tokens to stay within the
  tail-recursion limit; measured in M0.

### 6.2 Parser

Recursive descent over the token tuple producing an AST of object types. Expressions
use Pratt parsing with Postgres precedence:

```
.  ::  [ ]             highest
+ - (unary)
^
* / %
+ -
(other operators)      ||, ->, @>, ~, etc.
BETWEEN IN LIKE ILIKE SIMILAR
< > = <= >= <>
IS ISNULL NOTNULL
NOT
AND
OR                     lowest
```

Each parse function: `Parse<Tokens> = [Node, RestTokens] | SqlError`. Statement
kinds: `select` (with `with`, `distinct [on]`, set ops, `order`, `limit`, `offset`,
`for update`), `insert`, `update`, `delete`, `create_table`, `alter_table`,
`drop_table`, `create_view`, `drop_view`, `create_type`, `create_schema`,
`create_index` (schema no-op), `truncate` (no-op).

### 6.3 Binder (scopes and nullability)

Builds a scope from the FROM clause, in order:

- Table ref → `{ alias, columns, nullable: false }`; columns pulled from `DB`.
- `JOIN ... ON/USING`: `LEFT` marks the right item nullable, `RIGHT` the left,
  `FULL` both, `INNER`/`CROSS` neither. `USING (c)` merges `c` (non-null if either side is).
- Derived table `(SELECT ...) AS t` → recursively projected row becomes the columns.
- `LATERAL` → same, with the outer scope visible inside.
- CTEs (`WITH`, `WITH RECURSIVE`) → added to a CTE map visible to the main query and
  later CTEs; recursive CTE typed from the non-recursive term.
- Set-returning functions in FROM (`unnest`, `generate_series`, `jsonb_array_elements`,
  `json_to_recordset ... AS (a int, b text)`) → one-column or defined-column tables.
- `VALUES (...) AS v(a, b)` → columns from the first row's expression types.

Column resolution: `t.c` → lookup in `t`; bare `c` → search all scope items, error on
ambiguity (`column reference "c" is ambiguous`) or absence. `t.*` and `*` expand in
scope order.

### 6.4 Typer (expressions)

`TypeOf<Expr, Scope, Ctx> = { type: PgTypeName; nullable: boolean }`.

- Literals: number → `int4`/`numeric`, string → `text` (unknown-typed literal, coerces),
  `true/false` → `bool`, `NULL` → `{ type: "unknown"; nullable: true }`.
- Column ref → from scope, nullable = column.nullable || scopeItem.nullable.
- Cast `e::T`, `CAST(e AS T)` → `T`, nullability preserved.
- Operators: a type-level table keyed by `(op, left, right)` with numeric promotion
  (`int2|int4` → `int4`, any `int8` → `int8`, any `numeric` → `numeric`, any float →
  `float8`), text `||` → `text`, array `||`, JSON `->`/`#>` → same json kind,
  `->>`/`#>>` → `text`, containment/existence → `bool`, comparisons/`LIKE`/`~`/
  `BETWEEN`/`IN` → `bool`, date math (`timestamptz - timestamptz` → `interval`,
  `date + int` → `date`, `ts + interval` → `ts`). Strict operators: nullable if either
  side is nullable.
- `IS [NOT] NULL / TRUE / FALSE / DISTINCT FROM` → non-null `bool`.
- `AND`/`OR`/`NOT` → `bool`, nullable if any operand nullable (three-valued logic).
- `CASE` → common type of branches; nullable if any branch nullable or no `ELSE`.
- `COALESCE(a, b, ...)` → common type; nullable only if all args nullable.
  `NULLIF` → always nullable. `GREATEST`/`LEAST` → strict.
- Aggregates: `count` → `int8`, never null. Others (`sum`, `avg`, `min`, `max`,
  `string_agg`, `array_agg`, `json[b]_agg`, `bool_and/or`, ...) → nullable when the
  argument is nullable **or** the query has no `GROUP BY` (empty-set case).
  `FILTER (WHERE ...)` makes any aggregate nullable. `sum(int4)` → `int8`,
  `sum(int8)` → `numeric`, `avg(int*)` → `numeric`.
- Window functions: `row_number`/`rank`/`dense_rank`/`ntile` → `int8` non-null;
  `lag`/`lead`/`first_value`/`last_value`/`nth_value` → argument type, nullable.
- Scalar subquery `(SELECT ...)` → first column's type, always nullable.
  `EXISTS` → non-null `bool`. `x = ANY(...)`/`IN (SELECT ...)` → `bool`.
- Function catalog: `interface FunctionCatalog { lower: Sig<["text"], "text">; ... }`
  with strictness flags; unknown function → `{ type: "unknown"; nullable: true }`.
  Users extend via `declare module "@typesql/core" { interface FunctionCatalog {...} }`.
  Catalog covers string, numeric, date/time, JSON, array, UUID/crypto, and formatting
  functions (full list tracked in `packages/core/src/engine/catalog/`).
- Special syntaxes: `EXTRACT(f FROM x)` → `numeric`, `SUBSTRING(x FROM n FOR m)`,
  `TRIM(BOTH c FROM x)`, `POSITION(a IN b)`, `x AT TIME ZONE z`, `ARRAY[...]`,
  `ROW(...)`, `x::T[]`, array subscripts/slices, `DISTINCT` and `ORDER BY` inside
  aggregates, `WITHIN GROUP`.

### 6.5 Projection (row type and column names)

Postgres's naming rules for unaliased targets (from `FigureColname`):

| Target | Name |
|---|---|
| `AS alias` / bare alias | alias (folded unless quoted) |
| `t.col`, `col` | `col` |
| `f(...)` | `f` |
| `e::T` / `CAST(e AS T)` | name of `e` if it has one, else `T` |
| `CASE ...` | `case` |
| `COALESCE/NULLIF/GREATEST/LEAST/EXISTS/ARRAY/ROW` | lowercase keyword |
| `(SELECT c FROM ...)` scalar subquery | `c` |
| `EXTRACT(...)` | `extract` |
| anything else (literal, arithmetic, boolean) | `?column?` |

Duplicate names: both drivers build the row object left-to-right, so **the last
column wins**. Projection models this with a left-to-right merge.

`SELECT *` with duplicate names across joined tables collapses the same way; the type
reflects what you will actually receive.

Final row type: `{ [name]: TsTypeOf<TypeMap, pgType> | (nullable ? null : never) }`.
`DISTINCT`, `ORDER BY`, `LIMIT` do not change the row type.

### 6.6 Statement results

| Statement | `Row` | `Params` | Extra |
|---|---|---|---|
| `SELECT`, `VALUES`, `WITH ... SELECT`, set ops | projected row | inferred | — |
| `INSERT/UPDATE/DELETE ... RETURNING` | projected row (scope = target table, plus `FROM`/`USING`) | inferred | — |
| `INSERT/UPDATE/DELETE` without RETURNING | `never` | inferred | adapters expose `rowCount` |
| DDL | `never` | `[]` | `SchemaDelta` consumed by `ApplyDdl` |

Set operations require compatible column counts; the result takes names from the
first branch and the union of nullability per position.

### 6.7 Parameters

`$n` is typed from its context, unified across uses (same `$1` twice → intersection):

- `col <op> $1`, `$1 <op> col` → column type (non-null for comparisons).
- `INSERT ... VALUES ($1, ...)` → column type, `| null` if the column is nullable.
- `UPDATE ... SET col = $1` → same.
- `col IN ($1, $2)` / `= ANY($1)` → element type / array of element type.
- `LIMIT $1`, `OFFSET $1` → `number`.
- Function argument with a catalog signature → that type.
- `$1::T` → `T`'s TS type (cast beats context).
- No context → `unknown` (accepts anything).

`INSERT` column lists are checked: every non-nullable column without a default must be
present (`null value in column "email" violates not-null constraint` style message).
`INSERT ... DEFAULT VALUES`, `ON CONFLICT ... DO UPDATE SET ... = EXCLUDED.x` are in scope.

### 6.8 DDL → `ApplyDdl<DB, Q>`

Produces a new `DB`. Supported in v1:

- `CREATE TABLE [IF NOT EXISTS] [schema.]name (cols..., constraints...)` with
  `NOT NULL`, `NULL`, `DEFAULT`, `PRIMARY KEY` (implies NOT NULL), `serial`/`bigserial`,
  `GENERATED ... AS IDENTITY`, `GENERATED ALWAYS AS (expr) STORED`, `REFERENCES`
  (parsed, ignored), `CHECK` (ignored), `UNIQUE` (ignored), `LIKE other_table`.
- `ALTER TABLE name ADD COLUMN`, `DROP COLUMN`, `RENAME COLUMN`, `ALTER COLUMN TYPE`,
  `SET/DROP NOT NULL`, `SET/DROP DEFAULT`, `RENAME TO`, `ADD PRIMARY KEY`.
- `DROP TABLE [IF EXISTS]`, `CREATE [OR REPLACE] VIEW ... AS SELECT`, `DROP VIEW`,
  `CREATE TYPE ... AS ENUM (...)`, `ALTER TYPE ... ADD VALUE`, `CREATE SCHEMA`.
- Indexes, triggers, functions, grants, extensions: parsed loosely (skip to `;`),
  no schema effect.

`migrations()` builder: `.add(ddl)` accumulates `ApplyDdl` and the statement list;
`m.schema` is the phantom type, `m.statements` the runtime array for an adapter's
`migrate(client, m)` helper.

## 7. Runtime

- `sql(text, ...params)` → `{ text, values: params }`.
- Fragment splicing: `{name}` slots in the outer text are replaced by the fragment's
  text with its `$n` renumbered to follow the outer params. At the type level,
  `Splice<Q, Slots>` produces the combined literal and param tuple **before** lexing,
  so the engine only ever sees one string.
- `sql.id("col")` / `sql.id("schema", "table")` → quoted identifier fragment with a
  literal type when the input is a literal.
- `sql.join([f1, f2], ", ")` → preserves literal text for tuple inputs; array inputs
  yield `string`, which makes the outer query fall to `SqlError<"dynamic fragment ...">`
  unless `sql.as<Row>` is used.
- `sql.raw(text)` → never typed; forces the override path.
- Adapters: `@typesql/pg` (`query`, `one`, `maybeOne`, `many`, `execute` → rowCount,
  `transaction`), `@typesql/postgres` (same surface over `postgres.js`'s `unsafe`).
  Each exports its `TypeMap` and a pre-bound `createSql`.

## 8. Repo layout

```
typesql/
  package.json              # private workspace root
  pnpm-workspace.yaml
  tsconfig.base.json        # strict, moduleResolution bundler, lib es2024
  vitest.workspace.ts
  packages/
    core/                   # typesql — zero runtime deps
      src/
        index.ts
        create-sql.ts       # createSql, sql.as, fragments
        runtime/            # splice, renumber, identifiers
        schema/             # Col, Nullable, Generated, normalize type names
        type-map/           # default map + TsTypeOf
        engine/
          lexer/
          parser/           # select, dml, ddl, expr (pratt)
          binder/           # scope, joins, ctes
          typer/            # operators, catalog, aggregates
          project/          # naming, merge, statement result
          ddl/              # ApplyDdl, SchemaDelta
          errors.ts         # SqlError, messages
      test/
        types/              # *.test-d.ts — expectTypeOf per feature
        corpus/             # statements + expected row shapes
        conformance/        # runs corpus against real Postgres (testcontainers)
    pg/                     # @typesql/pg
    postgres/               # @typesql/postgres
    bench/                  # compile-time stress files + tsgo --extendedDiagnostics
  examples/
  docs/
```

## 9. Testing and benchmarks

- **Type tests**: vitest `--typecheck` with `expectTypeOf<Row>().toEqualTypeOf<...>()`
  and `@ts-expect-error` for every error path. One file per grammar feature.
- **Conformance**: the same corpus runs against a real Postgres in CI (testcontainers).
  For each statement: execute, compare returned column names to inferred keys, and
  `typeof` each value against the type map. This catches naming/folding mistakes and
  driver-parsing drift that pure type tests cannot.
- **Compile-time budget**: `packages/bench` has files with 1 / 50 / 500 queries of
  increasing length. CI records `tsgo --extendedDiagnostics` instantiation counts and
  check time; a regression beyond a threshold fails the build. Also a "max query
  length" probe to document the ceiling.
- **Error message snapshots**: `tsc`/`tsgo` output for the error corpus is snapshot-
  tested so messages stay readable.

## 10. Milestones

**M0 — Feasibility spike (1 week)**
Lexer + `SELECT a, b FROM t WHERE a = $1` end-to-end on TS 7.0. Measure: max
statement length before hitting limits, instantiations per query, editor latency.
Validate the `Q & Validate<DB, Q>` error-message pattern. Decide chunking strategy.
Exit criterion: 2 KB statement parses; 100 queries in a file check in < 1 s.

**M1 — Core SELECT + pg adapter**
FROM/aliases, all JOIN kinds with nullability, WHERE, ORDER BY/LIMIT/OFFSET, `*`,
`t.*`, aliases, literals, casts, arithmetic/comparison/boolean operators, `IS NULL`,
`$n` context typing, Postgres column naming, identifier folding. `@typesql/pg` with
`PgTypeMap`. Conformance harness up.

**M2 — Expressions**
Function catalog (string/numeric/date/JSON/array), aggregates with GROUP BY/HAVING
nullability, `FILTER`, `DISTINCT` in aggregates, CASE, COALESCE/NULLIF/GREATEST/LEAST,
IN/BETWEEN/LIKE/ILIKE/regex, arrays and subscripts, JSON operators, `EXTRACT` and
friends, enums. `@typesql/postgres` adapter with its type map. Module augmentation for
the catalog.

**M3 — Query structure**
Subqueries (scalar, `EXISTS`, `IN`, `ANY/ALL`), derived tables, `LATERAL`, CTEs incl.
`RECURSIVE`, `UNION/INTERSECT/EXCEPT [ALL]`, `DISTINCT ON`, window functions with
`OVER (...)` and named windows, `VALUES` lists, set-returning functions in FROM,
`FOR UPDATE`.

**M4 — DML**
INSERT (VALUES, multi-row, SELECT source, DEFAULT, `ON CONFLICT DO NOTHING/UPDATE`,
`EXCLUDED`), UPDATE (`SET`, `FROM`), DELETE (`USING`), RETURNING with full scope,
required-column checks, `rowCount` in adapters, `transaction` helpers.

**M5 — DDL and migrations**
`ApplyDdl` for the statement set in §6.8, `migrations()` builder, `migrate()` adapter
helper, views as schema members, enum types, nested schemas via `CREATE SCHEMA`.

**M6 — Composition and params sugar**
`{slot}` fragments with type-level splicing, `sql.id`, `sql.join`, `sql.raw`,
renumbering, named `:param` sugar, `sql.as<Row>` override polish.

**M7 — Hardening and release**
Error messages with positions and "did you mean" column suggestions, WHERE-based
nullability narrowing (`WHERE c IS NOT NULL` → non-null `c` in projection), docs site,
benchmark CI gate, 1.0 publish of the three packages.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| TS recursion/instantiation limits cap statement size | Token-level lexing, tail-recursive loops, nested loops to reset budgets, M0 measures the ceiling; `sql.as` as the documented escape for giant statements. |
| Editor latency on large files | tsgo's speed; keep every stage a tail-recursive alias; benchmark gate in CI. |
| Postgres grammar is enormous | Scope is explicit per milestone; anything else is a precise `SqlError`, never a silent `unknown`. |
| Driver type-parsing differences (`int8`, `numeric`, `date`, arrays) | Per-adapter type maps; conformance tests run against both drivers. |
| TS 7.1 not released yet (due ~Nov 2026) | Nothing in core needs 7.1. Develop on 7.0.x; bump the floor when 7.1 lands. |
| Tagged-template DX expectation | Documented up front; `/* sql */` comment hint for highlighters; revisit if #33304 ever lands. |
| Catalog correctness (return types, strictness) | Generate the catalog table from `pg_proc`/`pg_operator` with a one-off script, review by hand, keep the script for updates. |

## 12. Open questions (to settle during M0/M1)

1. Package names: `@typesql/*` on npm, or another scope? (Check availability before M1.)
2. Should `createSql` also accept a runtime schema object (for `migrate()` convenience
   and future runtime validation), or stay type-only? Current plan: type-only.
3. `date` and `timestamp` (without tz) under `pg` are `Date` by default; under
   `postgres.js` `date` is a string. Confirm the default maps against current driver
   versions when writing the adapters.
4. WHERE-narrowing of nullability is listed in M7; it could be pulled earlier if real
   usage shows LEFT JOIN + `IS NOT NULL` is common.
