# From a live database

`typesql introspect` reads your Postgres database and writes its schema to a TypeScript file. You get every table, view, materialized view and enum, with the exact Postgres type of each column.

## Generate the schema

The command ships with `@typesql/pg` and connects with `pg`:

```sh
npm install -D @typesql/pg pg
npx typesql introspect --url postgres://localhost/app --out src/db/schema.ts
```

Then use the generated `DB` type, and run the command again after each migration:

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(new Pool());
```

::: tip Why introspect?
The file has the real Postgres types: `timestamptz`, `date` and `timestamp` stay apart, as do `float8` and `int4`, or `uuid` and `text`. [ORM schemas](./orms) read types back from TypeScript types, which can't tell these apart.
:::

## Options

| Option | What it does |
|---|---|
| `--url <url>` | connection string; default `$DATABASE_URL` |
| `--out <file>` | output file; default stdout |
| `--schema <name>` | schema to read; repeat it or comma-separate (`--schema public,auth`). Default: every schema except `pg_catalog`, `information_schema` and `pg_*` |
| `--exclude <pattern>` | relation to leave out: a name or `schema.name`, where `*` matches anything (`--exclude 'kysely_migration*'`); repeat it or comma-separate |
| `--type-name <name>` | name of the interface; default `DB` |
| `--import-from <module>` | where `Col`, `View`, … are imported from; default `@typesql/core/postgres` |
| `--config <file>` | a module whose default export holds these options and the ones below |
| `--no-comments` | leave out the JSDoc (comments, domains, generated columns) |

## What is generated

| In the database | In the schema |
|---|---|
| table in `public` | `DB["users"]` |
| table in another schema | `DB["auth"]["sessions"]` |
| view, materialized view | `View<{ … }>` (read-only) |
| partitioned table, partition, foreign table | a table |
| `NOT NULL` column, or a domain with `NOT NULL` | `Col` |
| `DEFAULT`, `serial`, identity, `GENERATED ALWAYS AS (…) STORED` | `Generated`: optional in `INSERT` |
| `int4`, `timestamptz`, `uuid`, `numeric(12,2)`, `varchar(40)`, … | `"int4"`, `"timestamptz"`, `"uuid"`, `"numeric"`, `"varchar"` |
| array column | `"int4[]"`, `"mood[]"` |
| domain | its base type, also through domains over domains |
| `citext` | `"text"` |
| enum | its name, with the labels in `$types` in sort order |
| `json` / `jsonb` column given a type in [`columnTypes`](#json-columns) | `Json<T>`, with its flags |
| other types (`tstzrange`, extension types) | their name; an unknown name maps to `unknown` unless the type map has it |
| table and column comments | JSDoc |
| a name that is not a JS identifier (`password:write`) | a quoted key |

Enums are global in TypeSQL, so two enums with the same name in different schemas share one `$types` entry. A schema with the same name as a `public` table is an error, because both would be the same key of `DB`.

## JSON columns

A `jsonb` column is `unknown` by default. To give `json` and `jsonb` columns TypeScript types, list them under `columnTypes` in a config file:

```ts
export default {
	out: "src/db/schema.ts",
	schemas: ["public", "auth"],
	imports: ['import type { HistoryItem } from "../models/history.js";'],
	columnTypes: {
		"portfolio.history": "HistoryItem[]",
		"auth.users.settings": "{ theme: string }",
	},
} satisfies IntrospectConfig;
```

Each listed column becomes a [`Json<T>` column](./schema#typed-json-columns) of that type, with the column's flags (and `"json"` for a `json` column):

```ts
export interface DB {
	portfolio: {
		id: Generated<"uuid">;
		name: Col<"text">;
		created_at: Generated<"timestamptz">;
		history: Json<HistoryItem[], { hasDefault: true }>;
	};
}
```

Rows read the column as `T`, and you write values with [`sql.json()`](./parameters#json-values):

```ts
const sql = createSql<DB, PgTypeMap>();

const recent = sql(`
  SELECT name, history, history -> -1 -> 'value' AS last, created_at::date AS day
  FROM portfolio
  WHERE created_at > now() - interval '7 days'`);

declare const history: HistoryItem[];
const save = sql(
	`UPDATE portfolio SET history = ${sql.json(history)} WHERE name = $1`,
	"a",
);
```

- `imports` adds lines after the generated import, for the types `columnTypes` uses.
- The config file can be `.mjs`, or `.ts`.
- `columnTypes` can also be a function of the column, for example to read the type from the column comment.
- A key that names no column is an error. So is a column that is not `json` or `jsonb` (`json[]` included).
- `column` replaces a whole column descriptor, for any column. Return the TypeScript source to use (any helper of your own), or `undefined` to keep the default.

## From code

`@typesql/pg/introspect` exports the two steps, so you can run them from your own script:

- `introspect(client, options)` reads the database through any `pg` client. It returns plain data: relations, columns with their types, defaults, identity and generated expressions, comments and enums.
- `generateSource(data, options)` writes the file's source.

```ts
const client = new Client({ connectionString: process.env["DATABASE_URL"] });
await client.connect();
const schema = await introspect(client, { schemas: ["public"] });
await client.end();
await writeFile(
	"src/db/schema.ts",
	generateSource(schema, {
		columnTypes: (column) => /^@type (.+)$/.exec(column.comment ?? "")?.[1],
		imports: ['import type { HistoryItem } from "../models/history.js";'],
	}),
);
```

## View columns

Postgres doesn't record whether a view column can be NULL. TypeSQL marks one `NOT NULL` only when the view's definition proves it: a `NOT NULL` table column that no outer join or `ROLLUP` makes nullable, a constant, `count(*)`, `row_number()`, a `coalesce` with a `NOT NULL` argument, a `CASE` whose every branch is `NOT NULL`, or a built-in operator or cast over `NOT NULL` values (not `->>`). This needs PostgreSQL 16 or later; on older servers every view column is nullable.

When you know better, set `viewNotNull` in the config: `viewNotNull: (view, column) => view === "index_member"`.
