# DDL support

The DDL statements TypeSQL understands, how their columns are typed, the errors it reports and its limitations. For a guided introduction, see [From migrations](../guide/migrations).

## Overview

<<< @/snippets/ddl.ts#overview

| Piece | What it does |
|---|---|
| `ApplyDdl<DB, Q>` | type: the schema after running the DDL script `Q` (one or more `;`-separated statements) on `DB`, or `SqlError<message, tokenIndex>` |
| `migrations()` | runtime and type: an immutable list of SQL texts whose type tracks the resulting schema; invalid DDL is a compile error on the literal |
| `runMigrations(client, m)` | runtime: runs the list in order inside one transaction |

## Supported statements

These statements change the schema type. They are parsed completely, so syntax TypeSQL does not know is an error, not silently ignored.

| Object | Statements |
|---|---|
| Tables | `CREATE TABLE` (with `LIKE`, `INHERITS`, `PARTITION OF` or `AS query`), `SELECT … INTO`, `ALTER TABLE`, `DROP TABLE` |
| Views | `CREATE [MATERIALIZED] VIEW` (also `RECURSIVE`), `ALTER [MATERIALIZED] VIEW`, `DROP [MATERIALIZED] VIEW` |
| Enums | `CREATE TYPE … AS ENUM`, `ALTER TYPE` (`ADD VALUE`, `RENAME VALUE`, `RENAME TO`), `DROP TYPE` |
| Schemas | `CREATE SCHEMA` (also with embedded `CREATE TABLE` / `CREATE VIEW`), `ALTER SCHEMA … RENAME TO`, `DROP SCHEMA` |
| Functions | `CREATE FUNCTION`: its return type goes into `$functions` (`record` for `RETURNS TABLE`); arguments are not checked |

- `ALTER TABLE` changes the schema when it renames the table or moves it to another schema, adds, drops, renames or retypes a column, sets or drops `NOT NULL`, a default, an identity or a generation expression, or adds a primary key or a `NOT NULL` constraint. Its other actions are accepted without a schema effect.
- `ALTER TABLE` sub-commands run in Postgres's passes, not left to right, so `DROP COLUMN x, ADD COLUMN x int` works and `ADD COLUMN x int, DROP COLUMN x` is an error.
- Renaming an enum type retypes every column that uses it. `DROP TYPE … CASCADE` drops those columns and the views that use them.
- `CREATE TABLE … OF type` and `CREATE TABLE … AS EXECUTE` parse, but are rejected: their columns are unknown.
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` (seed data) and `DECLARE … CURSOR` are checked against the schema at that point, without a schema effect.
- Every other statement (indexes, sequences, triggers, extensions, grants, `$$` function bodies, transaction control, …) is accepted and skipped to the next `;`.

## How columns map to `Col` / `Nullable` / `Generated`

| Definition | Column |
|---|---|
| `email text NOT NULL` | `Col<"text">` |
| `name text` / `name text NULL` | `Nullable<"text">` |
| `id int PRIMARY KEY` | `Col<"int4">` |
| `id serial` (`serial4`, `bigserial` / `serial8`, `smallserial` / `serial2`) | `Generated<"int4">` (`int8`, `int2`) |
| `id bigint GENERATED ALWAYS AS IDENTITY` / `BY DEFAULT AS IDENTITY` | `Generated<"int8">` |
| `n int NOT NULL DEFAULT 0` | `Generated<"int4">` |
| `nick text DEFAULT 'x'` | `NullableGenerated<"text">` |
| `full text GENERATED ALWAYS AS (a \|\| b) STORED` | `NullableGenerated<"text">` (`Generated` with `NOT NULL`) |
| `tags text[]`, `m mood` (an enum) | `Nullable<"text[]">`, `Nullable<"mood">` (so `"happy" \| "sad" \| null`) |

The rules:

- A column is **not null** with `NOT NULL`, `PRIMARY KEY` (column or table level, also `ALTER TABLE ... ADD PRIMARY KEY`), `serial` types and identity columns.
- A column **has a default** (optional in `INSERT`) with `DEFAULT`, `serial` types, `GENERATED ... AS IDENTITY` and `GENERATED ALWAYS AS (expr) STORED`.
- Type names are normalized as in hand-written schemas: `integer` is `int4`, `character varying(255)` is `varchar`, `timestamp with time zone` is `timestamptz`, `int[][]` is `int4[]`.
- `REFERENCES`, `CHECK`, `UNIQUE`, `EXCLUDE`, `COLLATE`, `DEFERRABLE` and constraint names are parsed and ignored.

### Derived columns

These follow Postgres (verified against Postgres 17):

- `LIKE src` copies names, types and `NOT NULL`. It copies defaults only with `INCLUDING DEFAULTS | IDENTITY | GENERATED | ALL`. Any of these copies every default, because the schema does not record which kind of default a column has.
- `INHERITS (p)` and `PARTITION OF p` put the parent's columns first, with `NOT NULL` and defaults. A local column of the same name merges into it (`NOT NULL` if either side is). A different type is the error `column "k" has a type conflict`.
- `CREATE TABLE AS` keeps names and types only: every column is nullable, without a default.
- Views keep the nullability the query infers (`count(*)` is `Col<"int8">`). This is more precise than Postgres's catalog, which reports every view column as nullable.
- A column-name list (`CREATE VIEW v (a, b) AS ...`) renames columns by position. Extra query columns keep their names.

## Views, enums and schemas

- **Views** are `View<{...}>` (`{ $view: columns }`). They are readable like tables and rejected as `INSERT` / `UPDATE` / `DELETE` targets (`cannot insert into view "v"`). Materialized views are views.
- `CREATE OR REPLACE VIEW` may add columns, but not drop them (`cannot drop columns from view`) or change their types (`cannot change data type of view column "id" from integer to bigint`).
- **Enums** live in `DB["$types"]` as unions of their labels. A column typed with the enum maps to that union through the type map. Types are keyed by their unqualified name: `CREATE TYPE app.kind` registers `kind`.
- **Schemas**: `CREATE SCHEMA app` adds `app: {}` at the top level, and `app.t` lives in `DB["app"]["t"]`. Unqualified names and `public.x` are the top level.

## Errors

The message is Postgres's where there is one. The position is the token index in the whole script: the offending identifier, or the start of the statement.

| Area | Messages |
|---|---|
| Relations | `relation "users" already exists`, `relation "nope" does not exist`, `table "t" does not exist`, `view "v" does not exist`, `"v" is not a table`, `"t" is not a view` |
| Columns | `column "email" of relation "users" already exists`, `column "x" of relation "users" does not exist`, `column "x" does not exist` (`RENAME COLUMN`), `column "a" specified more than once`, `column "b" named in key does not exist` |
| Keys and nullability | `multiple primary keys for table "t" are not allowed`, `conflicting NULL/NOT NULL declarations for column "a" of table "t"`, `column "c" of relation "t" must be declared NOT NULL before identity can be added` |
| Views | `ALTER action ADD COLUMN cannot be performed on relation "v"`, `too many column names were specified`, `CREATE VIEW specifies more column names than columns` |
| Types | `type "mood" already exists`, `type "nope" does not exist`, `enum label "happy" already exists`, `"zz" is not an existing enum label`, `cannot drop type mood because other objects depend on it` |
| Schemas | `schema "s" does not exist`, `schema "s" already exists`, `cannot drop schema s because other objects depend on it` |

## `migrations()`

```ts
const m = migrations()                         // Migrations<{}>
const m2 = migrations<ExistingDB>()            // start from a hand-written schema
  .add("ALTER TABLE users ADD COLUMN bio text")
  .add(`CREATE TABLE a (...); CREATE INDEX ON a (x);`) // one entry may hold several statements
  .raw("SELECT pg_advisory_lock(1)");         // unchecked; schema type unchanged
const m3 = m2.raw<NewDB>("...");               // unchecked; you state the resulting schema

m2.statements   // readonly string[]: the texts in order (frozen)
m2.schema       // phantom: the schema type; undefined at runtime
SchemaOf<typeof m2>
```

- `.add<const Q>(ddl: ValidateDdl<Schema, Q> & Q)` checks `Q` against the schema built so far.
- An error lands on the literal, like with `sql()`: `Argument of type '"DROP TABLE nope"' is not assignable to parameter of type 'SqlError<"table \"nope\" does not exist", 2> & "DROP TABLE nope"'`.
- A non-literal string is rejected. Use `.raw()` for it.
- Builders are immutable: `.add()` returns a new builder, so a shared prefix can branch.
- Keep one migration per `.add()`. A single text is limited to about 4000 tokens.

## `runMigrations(client, m)`

```ts
interface MigrationClient { query(text: string): Promise<unknown> }
runMigrations(client: MigrationClient, m: { readonly statements: readonly string[] }): Promise<void>
```

- Sends `BEGIN`, each entry of `m.statements`, then `COMMIT`. On the first failure it sends `ROLLBACK` and rethrows the original error.
- Each entry is one `query()` call without parameters, so multi-statement entries need a driver that uses the simple query protocol for them (node-postgres does).
- The client must be a single connection, because `BEGIN` and `COMMIT` have to reach the same session:

```ts
// node-postgres
const client = await pool.connect();
try { await runMigrations(client, m); } finally { client.release(); }

// postgres.js
const reserved = await sql.reserve();
try { await runMigrations({ query: (text) => reserved.unsafe(text) }, m); } finally { reserved.release(); }
```

The adapters' `migrate(db, m)` does the same and handles the connection.

- It doesn't record which migrations already ran. Track applied entries in your own table and pass only the pending ones: `runMigrations(client, { statements: m.statements.slice(applied) })`.
- Statements that can't run in a transaction block (`CREATE INDEX CONCURRENTLY`, `VACUUM`) need a separate step. After `ALTER TYPE ... ADD VALUE`, the new label can't be used in the same transaction.

## Cost

Measured with TypeScript 7.1.0-beta (`tsc --extendedDiagnostics`):

| Input | Instantiations | Check time |
|---|---|---|
| importing `@typesql/core` (baseline) | 131K | 0.16 s |
| a 10-statement migration chain, DDL only | +33K | +0.01 s |
| the same chain plus one query on the result | 186K total | 0.17 s |
| 50 statements | 297K | 0.22 s |
| 200 statements and four queries | 1.15M | 0.53 s |
| `test/types/writes/ddl-views-types.test-d.ts` (≈60 assertions) | 474K | 0.38 s |

Each statement rebuilds only the table it changes, so long migration histories stay within TypeScript's limits ([Type engine](../guide/type-engine)).

## Limitations

- **No dependency tracking.** Dropping a table or column that a view uses is accepted, and `CASCADE` does not drop dependent views (except `DROP TYPE ... CASCADE`, which drops the columns and views that use the type). Views keep the columns they were created with.
- **The kind of default is not recorded.** `hasDefault` covers `DEFAULT`, serial, identity and generated columns. So inserting into `GENERATED ALWAYS` or stored generated columns is not rejected, `SET DEFAULT` on an identity column and `DROP IDENTITY` on a plain column are accepted, and `LIKE ... INCLUDING DEFAULTS` copies identity and generated defaults too.
- **Primary keys are not recorded after `CREATE TABLE`.** A second primary key added by `ALTER TABLE`, and `DROP NOT NULL` on a key column, are accepted.
- **Contradictory sub-commands** in one `ALTER TABLE` (`SET NOT NULL` and `DROP NOT NULL` on the same column) follow the pass order, but Postgres's prepare-time checks are not modeled.
- **Schemas and public relations share the top-level keys of `DB`.** A schema and a public table cannot have the same name (an error explains this), and an empty schema `{}` looks like an empty table. `DROP SCHEMA public` is rejected.
- **`search_path` is ignored**, except inside `CREATE SCHEMA ... CREATE ...`, where the new schema comes first, as in Postgres.
- **Enums are keyed by unqualified name**, and label order (`BEFORE` / `AFTER`) is not tracked.
- **Composite types, domains and extension types** are accepted as column types and map to `unknown` unless the type map knows them.
- **Column-name lists** cannot rename the columns of a `SELECT *` (list the columns instead). Duplicate names hidden inside one `*` (`SELECT * FROM a JOIN b`) are not detected.
- `PARTITION OF parent (col WITH OPTIONS ...)` column options, typed tables (`CREATE TABLE t OF type`) and `CREATE TABLE t AS EXECUTE stmt` are not supported.
- Temporary tables are added like regular tables.
- In hovers, columns changed or added by `ALTER TABLE` move to the end of the table.
