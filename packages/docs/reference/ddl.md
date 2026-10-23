# DDL support

The schema a query is checked against can be written by hand (`interface DB { ... }`, see
[Schema and type maps](../guide/schema)) or derived from the DDL that creates it. Three pieces:

| Piece | What it does |
|---|---|
| `ApplyDdl<DB, Q>` | type: the schema after running the DDL script `Q` (one or more `;`-separated statements) on `DB`, or `SqlError<message, tokenIndex>` |
| `migrations()` | runtime + type: an immutable list of SQL texts whose type tracks the resulting schema; invalid DDL is a compile error on the literal |
| `runMigrations(client, m)` | runtime: run the list in order inside one transaction |

```ts
import { createSql, migrations, runMigrations, type SchemaOf } from "@typesql/core";

export const m = migrations()
  .add("CREATE TYPE mood AS ENUM ('happy', 'sad')")
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, mood mood)")
  .add("ALTER TABLE users ADD COLUMN display_name text")
  .add("CREATE VIEW user_emails AS SELECT id, email FROM users");

type DB = SchemaOf<typeof m>;
// {
//   $types: { mood: "happy" | "sad" };
//   users: { id: Generated<"int4">; email: Col<"text">; mood: Nullable<"mood">; display_name: Nullable<"text"> };
//   user_emails: View<{ id: Col<"int4">; email: Col<"text"> }>;
// }

const sql = createSql<DB>();
sql("SELECT id, mood FROM users WHERE email = $1", "a@b.c"); // { id: number; mood: "happy" | "sad" | null }

await runMigrations(client, m); // BEGIN; each statement; COMMIT (ROLLBACK on error)
```

## Supported statements

Statements with a schema effect are parsed completely, including their trailing clauses, so
syntax the engine does not know is an error instead of being silently ignored.

| Statement | Effect |
|---|---|
| `CREATE [TEMP \| UNLOGGED] TABLE [IF NOT EXISTS] [schema.]name (...)` | column definitions, table constraints (`PRIMARY KEY (..., c WITHOUT OVERLAPS)`, `NOT NULL c`), `LIKE src [INCLUDING ... \| EXCLUDING ...]`; trailing `INHERITS (...)`, `PARTITION BY ...`, `USING`, `WITH (...)`, `ON COMMIT`, `TABLESPACE` |
| `CREATE TABLE name PARTITION OF parent FOR VALUES ... \| DEFAULT` | the parent's columns |
| `CREATE TABLE [IF NOT EXISTS] name [(cols)] AS query [WITH [NO] DATA]` | columns from the query (`AS EXECUTE stmt(...)` parses, but is rejected: the prepared statement's columns are unknown) |
| `CREATE TABLE name OF type [(c WITH OPTIONS ..., ...)]` | parses, but is rejected: the columns of composite types are not tracked |
| `ALTER TABLE [IF EXISTS] [ONLY] name action, ...` | `ADD [COLUMN] [IF NOT EXISTS]`, `DROP [COLUMN] [IF EXISTS] ... [CASCADE]`, `ALTER [COLUMN] c [SET DATA] TYPE t [USING e]`, `SET / DROP NOT NULL`, `SET / DROP DEFAULT`, `ADD GENERATED ... AS IDENTITY`, `DROP IDENTITY`, `DROP EXPRESSION`, `ADD [CONSTRAINT n] PRIMARY KEY (cols)`, `ADD [CONSTRAINT n] NOT NULL c` (no effect with `NOT VALID`); other actions (constraints, triggers, RLS, owner, storage, ...) have no schema effect |
| `ALTER TABLE name RENAME [COLUMN] a TO b` / `RENAME TO new` / `SET SCHEMA s` | standalone, as in Postgres (cannot be combined with other actions) |
| `ALTER VIEW` / `ALTER MATERIALIZED VIEW` | same grammar; views accept renames and defaults only |
| `DROP TABLE [IF EXISTS] a, b [CASCADE \| RESTRICT]` | |
| `CREATE [OR REPLACE] [TEMP] VIEW name [(cols)] [WITH (...)] AS query [WITH CHECK OPTION]` | a read-only relation |
| `CREATE [OR REPLACE] [TEMP] RECURSIVE VIEW name (cols) AS query` | as Postgres: `CREATE VIEW name AS WITH RECURSIVE name (cols) AS (query) SELECT cols FROM name` |
| `CREATE MATERIALIZED VIEW [IF NOT EXISTS] name [(cols)] ... AS query [WITH [NO] DATA]` | a read-only relation |
| `DROP [MATERIALIZED] VIEW [IF EXISTS] a, b [CASCADE]` | |
| `CREATE TYPE name AS ENUM ('a', ...)` | `$types[name]` |
| `ALTER TYPE name ADD VALUE [IF NOT EXISTS] 'v' [BEFORE \| AFTER 'w']`, `RENAME VALUE 'a' TO 'b'`, `RENAME TO new` | renaming the type also retypes every column using it |
| `DROP TYPE [IF EXISTS] a, b [CASCADE]` | `CASCADE` drops the columns (and views) that use the type |
| `CREATE SCHEMA [IF NOT EXISTS] name [AUTHORIZATION role]`, `CREATE SCHEMA AUTHORIZATION role` | an empty nested schema |
| `CREATE SCHEMA name [AUTHORIZATION role] CREATE TABLE ... CREATE VIEW ... CREATE INDEX ... CREATE SEQUENCE ... CREATE TRIGGER ... GRANT ...` | the schema with its tables and views; as in Postgres, tables are created before views, and unqualified names in the elements find the new schema's relations first |
| `ALTER SCHEMA name RENAME TO new` | |
| `DROP SCHEMA [IF EXISTS] a, b [CASCADE]` | |
| `CREATE [OR REPLACE] FUNCTION name(…) RETURNS [SETOF] type`, `RETURNS TABLE (…)` | `$functions[name]` with the return type (`record` for `TABLE`); arguments are not checked |
| `SELECT`, `INSERT`, `UPDATE`, `DELETE` (seed data), `DECLARE name CURSOR FOR query` | checked against the schema at that point; no schema effect |

No schema effect (skipped to the next `;`): `CREATE / ALTER / DROP INDEX`, `SEQUENCE`,
`ALTER / DROP FUNCTION`, `PROCEDURE` (`$$` bodies and `BEGIN ATOMIC ... END` bodies included), `TRIGGER`,
`EXTENSION`, `POLICY`, `DOMAIN`, `RULE`, composite / range types, `COMMENT ON`, `GRANT`,
`REVOKE`, `TRUNCATE`, `BEGIN` / `COMMIT` / `ROLLBACK` / `END` / `ABORT`, `SET`, `DO`, `ANALYZE`, `VACUUM`,
`REFRESH MATERIALIZED VIEW`, `REASSIGN OWNED`, `ALTER TABLE ALL IN TABLESPACE`, and the other utility statements.
`FETCH`, `MOVE` and `CLOSE` are parsed and have no schema effect either.

## How columns map to `Col` / `Nullable` / `Generated`

`nullable` is false with `NOT NULL`, `PRIMARY KEY` (column or table level, also
`ALTER TABLE ... ADD PRIMARY KEY`), `serial` types and identity columns. `hasDefault`
(optional on INSERT) is true with `DEFAULT`, `serial` types, `GENERATED ... AS IDENTITY` and
`GENERATED ALWAYS AS (expr) STORED`.

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
| `tags text[]`, `m mood` (an enum) | `Nullable<"text[]">`, `Nullable<"mood">` → `"happy" \| "sad" \| null` |

Type names are normalized as in hand-written schemas (`integer` → `int4`,
`character varying(255)` → `varchar`, `timestamp with time zone` → `timestamptz`, `int[][]`
→ `int4[]`, ...). `REFERENCES`, `CHECK`, `UNIQUE`, `EXCLUDE`, `COLLATE`, `DEFERRABLE` and
constraint names are parsed and ignored.

Derived columns follow Postgres (verified against Postgres 17):

- `LIKE src` copies names, types and `NOT NULL`; defaults only with
  `INCLUDING DEFAULTS | IDENTITY | GENERATED | ALL` (approximation: any of them copies every
  `hasDefault`, since the schema does not record which kind of default a column has).
- `INHERITS (p)` and `PARTITION OF p` put the parent's columns first, with `NOT NULL` and
  defaults; a local column of the same name merges into it (`NOT NULL` if either side is),
  a different type is `column "k" has a type conflict`.
- `CREATE TABLE AS` keeps names and types only: every column is nullable, without default.
- Views keep the nullability the query infers (`count(*)` is `Col<"int8">`), which is more
  precise than Postgres's catalog (it reports every view column as nullable).
- A column-name list (`CREATE VIEW v (a, b) AS ...`) renames positionally; extra query
  columns keep their names.

`ALTER TABLE` sub-commands run in Postgres's passes, not left to right: drops first, then
`ALTER TYPE`, then `ADD COLUMN`, then `SET NOT NULL` / identity / primary key, then
`SET DEFAULT`. So `DROP COLUMN x, ADD COLUMN x int` works and `ADD COLUMN x int, DROP COLUMN x`
is `column "x" of relation "t" does not exist`, as in Postgres.

## Views, enums and schemas

- Views are `View<{...}>` (`{ $view: columns }`): readable like tables, rejected as
  `INSERT` / `UPDATE` / `DELETE` targets (`cannot insert into view "v"`). Materialized views
  are views. `CREATE OR REPLACE VIEW` may add columns but not drop them
  (`cannot drop columns from view`) or change their types
  (`cannot change data type of view column "id" from integer to bigint`).
- Enums live in `DB["$types"]` as unions of their labels; a column typed with the enum maps
  to that union through the type map. Types are keyed by their unqualified name
  (`CREATE TYPE app.kind` registers `kind`).
- `CREATE SCHEMA app` adds `app: {}` at the top level; `app.t` lives in `DB["app"]["t"]`.
  Unqualified names and `public.x` are the top level.

## Errors

The message is Postgres's where there is one; the position is the token index in the
whole script (the offending identifier, or the statement start).

```
relation "users" already exists               relation "nope" does not exist
table "t" does not exist                      view "v" does not exist
column "email" of relation "users" already exists
column "x" of relation "users" does not exist column "x" does not exist (RENAME COLUMN)
column "a" specified more than once           column "b" named in key does not exist
multiple primary keys for table "t" are not allowed
conflicting NULL/NOT NULL declarations for column "a" of table "t"
column "c" of relation "t" must be declared NOT NULL before identity can be added
"v" is not a table / "t" is not a view        ALTER action ADD COLUMN cannot be performed on relation "v"
type "mood" already exists                    type "nope" does not exist
enum label "happy" already exists             "zz" is not an existing enum label
cannot drop type mood because other objects depend on it
schema "s" does not exist                     schema "s" already exists
cannot drop schema s because other objects depend on it
too many column names were specified          CREATE VIEW specifies more column names than columns
```

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

- `.add<const Q>(ddl: ValidateDdl<Schema, Q> & Q)` checks `Q` against the schema built so
  far. An error lands on the literal like `sql()` does:
  `Argument of type '"DROP TABLE nope"' is not assignable to parameter of type 'SqlError<"table \"nope\" does not exist", 2> & "DROP TABLE nope"'`.
  A non-literal string is rejected (use `.raw()`).
- Builders are immutable: `.add()` returns a new builder, so a shared prefix can branch.
- Keep one migration per `.add()`: a single text is limited to ~4000 tokens.

## `runMigrations(client, m)`

```ts
interface MigrationClient { query(text: string): Promise<unknown> }
runMigrations(client: MigrationClient, m: { readonly statements: readonly string[] }): Promise<void>
```

Sends `BEGIN`, every entry of `m.statements` in order (each with one `query()` call, no
parameters, so multi-statement entries need a driver that uses the simple query protocol
for parameterless queries — node-postgres does), then `COMMIT`. On the first failure it
sends `ROLLBACK` and rethrows the original error (a failing `ROLLBACK` does not mask it).

The client must be a single connection, because `BEGIN` and `COMMIT` have to reach the same
session:

```ts
// node-postgres
const client = await pool.connect();
try { await runMigrations(client, m); } finally { client.release(); }

// postgres.js
const reserved = await sql.reserve();
try { await runMigrations({ query: (text) => reserved.unsafe(text) }, m); } finally { reserved.release(); }
```

`runMigrations` does not record which migrations already ran; track applied entries (e.g.
by index or a hash of each text) in your own table and pass only the pending ones:
`runMigrations(client, { statements: m.statements.slice(applied) })`. Statements that
cannot run in a transaction block (`CREATE INDEX CONCURRENTLY`, `VACUUM`) need a separate
step; `ALTER TYPE ... ADD VALUE` works but the new label cannot be used in the same
transaction.

## Cost

Measured with TypeScript 7.1.0-beta (`tsc --extendedDiagnostics`):

| Input | Instantiations | Check time |
|---|---|---|
| importing `@typesql/core` (baseline) | 131K | 0.16 s |
| a 10-statement migration chain, DDL only | +33K | +0.01 s |
| the same chain plus one query on the result | 186K total | 0.17 s |
| 50 statements | 297K | 0.22 s |
| 200 statements and four queries | 1.15M | 0.53 s |
| `test/types/ddl-views-types.test-d.ts` (≈60 assertions) | 474K | 0.38 s |

Each statement rebuilds the table it changes and the top-level map; unchanged tables are
reused as they are. Every stored object is built from single-key parts, so a schema does
not reference its predecessors: long migration histories do not hit TypeScript's
instantiation-depth limit (see the comment on `Build` in `engine/ddl/apply.ts`).

## Limitations

- No dependency tracking: dropping a table or column that a view uses is accepted, and
  `CASCADE` does not drop dependent views (except `DROP TYPE ... CASCADE`, which drops the
  columns and views that use the type). Views keep the columns they were created with.
- The kind of default is not recorded (`hasDefault` covers `DEFAULT`, serial, identity and
  generated columns): inserting into `GENERATED ALWAYS` / stored generated columns is not
  rejected, `SET DEFAULT` on an identity column and `DROP IDENTITY` on a plain column are
  accepted, and `LIKE ... INCLUDING DEFAULTS` copies identity/generated defaults too.
- Primary keys are not recorded after `CREATE TABLE`: a second primary key added by
  `ALTER TABLE` and `DROP NOT NULL` on a key column are accepted.
- Contradictory sub-commands in one `ALTER TABLE` (`SET NOT NULL` and `DROP NOT NULL` on the
  same column) follow the pass order, but Postgres's prepare-time checks are not modeled.
- Schemas and public relations share the top-level keys of `DB`: a schema and a public table
  cannot have the same name (an error explains this), and an empty schema `{}` looks like an
  empty table. `search_path` is ignored (except inside `CREATE SCHEMA ... CREATE ...`, where the
  new schema comes first, as in Postgres). `DROP SCHEMA public` is rejected.
- Enums are keyed by unqualified name; label order (`BEFORE` / `AFTER`) is not tracked.
  Composite types, domains and extension types are accepted as column types and map to
  `unknown` unless the type map knows them.
- A column-name list cannot rename the columns of a `SELECT *` (list the columns), and
  duplicate names hidden inside one `*` (`SELECT * FROM a JOIN b`) are not detected.
- `PARTITION OF parent (col WITH OPTIONS ...)` column options and typed tables
  (`CREATE TABLE t OF type`) are not supported, nor is `CREATE TABLE t AS EXECUTE stmt`.
  `SELECT ... INTO new_table` creates the table like `CREATE TABLE new_table AS SELECT ...`.
- Temporary tables are added like regular tables.
- `ALTER TABLE` order of display: modified or added keys move to the end of the hover.
