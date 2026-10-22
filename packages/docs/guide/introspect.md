# Introspection

`typesql introspect` reads a live Postgres database and writes its schema as a TypeScript file:
tables, views, materialized views and enums, with the exact Postgres type of every column. It
ships with `@typesql/pg` and connects with `pg`:

```sh
pnpm add -D @typesql/pg pg
pnpm exec typesql introspect --url postgres://localhost/app --out src/db/schema.ts
```

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(new Pool());
```

Run it again after each migration. Unlike the [ORM schemas](./orm-schemas), which read Postgres
types back from TypeScript types, the generated file has the real types: `timestamptz`, `date`
and `timestamp` stay apart, as do `float8` and `int4`, `uuid` and `text`. Date arithmetic,
comparisons and aggregates are then typed the way Postgres runs them.

## Options

| Option | |
|---|---|
| `--url <url>` | connection string; default `$DATABASE_URL` |
| `--out <file>` | output file; default stdout |
| `--schema <name>` | schema to read; repeat it or comma-separate (`--schema public,auth`). Default: every schema except `pg_catalog`, `information_schema` and `pg_*` |
| `--exclude <pattern>` | relation to leave out: a name or `schema.name`, `*` matches anything (`--exclude 'kysely_migration*'`); repeat it or comma-separate |
| `--type-name <name>` | name of the interface; default `DB` |
| `--import-from <module>` | where `Col`, `View`, ... are imported from; default `@typesql/core` |
| `--config <file>` | a module whose default export holds these options and the ones below |
| `--no-comments` | leave out the JSDoc (comments, domains, generated columns) |

## What is generated

| Database | Schema |
|---|---|
| table in `public` | `DB["users"]` |
| table in another schema | `DB["auth"]["sessions"]` |
| view, materialized view | `View<{ … }>` (read-only) |
| partitioned table, partition, foreign table | a table |
| `NOT NULL` column, or a domain with `NOT NULL` | `Col` |
| `DEFAULT`, `serial`, identity, `GENERATED ALWAYS AS (…) STORED` | `Generated`: optional in `INSERT` |
| `int4`, `timestamptz`, `uuid`, `numeric(12,2)`, `varchar(40)`, … | `"int4"`, `"timestamptz"`, `"uuid"`, `"numeric"`, `"varchar"` |
| array column | `"int4[]"`, `"mood[]"` |
| domain | its base type, through domains over domains |
| `citext` | `"text"` |
| enum | its name, with the labels in `$types` in sort order |
| `json` / `jsonb` column given a type in [`columnTypes`](#json-columns) | `Json<T>`, with its flags |
| other types (`tstzrange`, extension types) | their name; an unknown name maps to `unknown` unless the type map has it |
| table and column comments | JSDoc |
| a name that is not a JS identifier (`password:write`) | a quoted key |

Postgres does not record whether a view column can be NULL. A view column is `NOT NULL` only
when its definition proves it: a `NOT NULL` column of a table that no outer join or `ROLLUP`
nulls, a constant, `count(*)`, `row_number()`, a `coalesce` with a `NOT NULL` argument, a CASE
whose every branch is `NOT NULL`, a built-in operator or cast over `NOT NULL` values (not `->>`),
the key of `jsonb_each`, and so on. Everything else in a view is nullable. This needs
PostgreSQL 16 or later; on older servers every view column is nullable. When you know better,
set `viewNotNull` in the config: `viewNotNull: (view, column) => view === "index_member"`.

Enums are global in typesql (`Col<"mood">`), so two enums of the same name in different
schemas share one `$types` entry with the labels of both. A schema with the same name as a
`public` table is an error, because both would be the same key of `DB`.

## JSON columns

A `jsonb` column is `unknown` by default. Give `json` / `jsonb` columns TypeScript types with
`columnTypes` in a config file:

<<< @/snippets/introspect.ts#config

Each listed column is declared as a [`Json<T>` column](./schema#typed-json-columns) of that
type, with the column's flags (and `"json"` for a `json` column):

<<< @/snippets/introspect.ts#generated

It is still `jsonb` to the SQL, rows read it as `T`, `->` / `#>` index into `T`, and values are
written with [`sql.json()`](./parameters#json-values):

<<< @/snippets/introspect.ts#use

`imports` adds lines after the generated import, for the types `columnTypes` uses. The config
file can be `.mjs` or, with Node.js 26, `.ts`. `columnTypes` can also be a function of the
column, for example to read the type from the column comment. A key that names no column, or a
column that is not `json` / `jsonb` (`json[]` included), is an error. `column` replaces a whole
descriptor, for any column: return the TypeScript source to use (any helper of your own), or
`undefined` to keep the default.

## From code

`@typesql/pg/introspect` exports the pieces: `introspect(client, options)` reads the database
through any `pg` client and returns plain data (relations, columns with their types, defaults,
identity and generated expressions, comments, enums), and `generateSource(data, options)`
writes the file.

<<< @/snippets/introspect.ts#api
