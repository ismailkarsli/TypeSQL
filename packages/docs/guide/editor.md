# Editor completions

TypeScript checks a statement and shows its errors and row type in the editor, but it does
not suggest what to type inside the string. The TypeSQL extension for VS Code does:

```ts
sql("SELECT * FROM |");          // users, posts, active_users, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

The names come from the `DB` type of the `sql` you call, so they follow your schema as you
edit it, unsaved changes included. The extension adds suggestions only: errors, hovers and row
types are TypeScript's, as without it.

## Setup

1. Install the TypeSQL extension from the
   [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql)
   or [Open VSX](https://open-vsx.org/extension/typesql/typesql). It installs the TypeScript 7
   extension (`TypeScriptTeam.native-preview`) with it.
2. Have `@typesql/core` 0.3.0 or later in the project, directly or through an adapter
   (`@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`,
   `@typesql/prisma`). The extension loads the project's own copy, so suggestions follow the
   version the project checks with.
3. Run the language server on TypeScript 7.1 or later. Version 1.0 of the TypeScript 7 extension
   bundles TypeScript 7.0, whose API cannot read the editor's program, and its version picker
   does not list a workspace `typescript` package. Either add TypeScript 7.1 to the project and
   point the extension at it in `.vscode/settings.json`:

   ```sh
   npm install -D typescript@7.1.0-beta
   ```

   ```jsonc
   {
     "js/ts.experimental.useTsgo": true,
     "js/ts.tsdk.path": "node_modules/typescript"
   }
   ```

   and choose **Allow** when VS Code asks whether to use it (once per workspace); or install
   the **TypeScript 7 Nightly** extension, which the TypeScript 7 extension then uses. The
   **TypeScript 7** output channel's first line shows which server started.

Turn suggestions off with `"typesql.completions.enable": false`.

## What it suggests

| Before the cursor | Suggestions |
|---|---|
| `FROM`, `JOIN`, `INTO`, `UPDATE`, `TABLE`, `USING`, a comma in a FROM list | tables and views (those the statement already uses first), CTEs, schemas |
| `schema.` | the relations of that schema; `pg_catalog.` for the `PgCatalog` slice |
| `alias.` or `table.` | the columns of that FROM item, with their types |
| `SELECT`, `WHERE`, `ON`, `AND`, `BY`, `RETURNING`, an operator, `(`, a comma in a list | the columns of every FROM item in scope, then their aliases |
| `INSERT INTO t (`, `UPDATE t SET`, `ON CONFLICT (` | the columns of `t` |

Aliases follow scope: a subquery sees its own FROM items first, then the outer query's.
Subqueries and CTEs offer the names of their output columns. Names that Postgres would fold
or read as a keyword are inserted in double quotes (`"UserAccounts"`, `"order"`). Suggestions
work in `sql()`, in `tx()` inside `sql.transaction()`, in `sql.fragment()` and `sql.as()`, in
template literals across lines, and between `${sql.param()}` values. There are none inside
string literals, comments and quoted identifiers.

## How it works

The TypeScript 7 extension runs the TypeScript language server. When it answers a completion
request, the TypeSQL extension opens an API session on that same server (no second
TypeScript process), finds the `sql()` call at the cursor, reads relations and columns from
its `DB` type with the checker, and reads the text before the cursor with a small scanner:
keywords, FROM items, aliases and CTEs. It never evaluates the statement's types, so a
request typically takes 10 to 30 ms. A request that fails or takes longer than 150 ms adds
nothing.

TypeScript itself offers one item inside a valid statement: the statement text, which would
replace the whole string. With a TypeScript 7 extension that lets other extensions change its
responses (TypeScript 7.1's extension API), TypeSQL drops that item. Version 1.0 of the
TypeScript 7 extension does not, so there TypeSQL adds its own suggestion provider and VS Code
shows both lists, the statement text included. That version also does not say which TypeScript
its server runs, so TypeSQL tries the TypeScript packages it can find (the `js/ts.tsdk.path`
package, the project's, the nightly extension's) and keeps the one the server understands.

## Troubleshooting

- The **TypeSQL** output channel logs which `@typesql/core` and which TypeScript API client the
  extension loaded, slow requests and errors, and says so when the language server runs
  TypeScript 7.0 or when no client matches it.
- Suggestions you see without the extension, such as words from open files (`abc` icon), come
  from VS Code; `"editor.wordBasedSuggestions": "off"` turns those off.
- After installing or upgrading `@typesql/core` or `typescript`, run **TypeScript: Restart TS
  Server** so the extension looks them up again.
- The TypeScript 7 extension's API is new in TypeScript 7.1 and may still change before 7.1
  is final.
