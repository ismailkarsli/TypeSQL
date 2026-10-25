# VS Code extension

The TypeSQL extension for VS Code completes table and column names inside your SQL strings, and highlights the SQL.

```ts
sql("SELECT * FROM |");          // users, posts, active_users, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

The names come from the `DB` type of the `sql` you call, so they follow your schema as you edit it, unsaved changes included.

The extension is optional: errors, hovers and row types come from TypeScript, with or without it.

## Setup

1. Install the TypeSQL extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql) or [Open VSX](https://open-vsx.org/extension/typesql/typesql). Install the [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview) (`TypeScriptTeam.native-preview`) too.
2. Have `@typesql/core` 0.4.0 or later in the project, directly or through an adapter (`@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`).
3. Run the language server on TypeScript 7.1 or later, as below.

### Use TypeScript 7.1

Version 1.0 of the TypeScript 7 extension bundles TypeScript 7.0, whose API cannot read the editor's program. Its version picker also does not list a workspace `typescript` package. You have two options.

**Option 1: the project's TypeScript.** Add TypeScript 7.1 to the project:

```sh
npm install -D typescript@7.1.0-beta
```

Point the extension at it in `.vscode/settings.json`:

```jsonc
{
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.path": "node_modules/typescript"
}
```

Choose **Allow** when VS Code asks whether to use it (once per workspace).

**Option 2: the nightly.** Install the **TypeScript 7 Nightly** extension. The TypeScript 7 extension then uses it.

The first line of the **TypeScript 7** output channel shows which server started.

To turn suggestions off, set `"typesql.completions.enable": false`.

## What it suggests

| After | Suggestions |
|---|---|
| `FROM`, `JOIN`, `INTO`, `UPDATE`, `TABLE`, `USING`, a comma in a FROM list | tables and views (the ones the statement already uses first), CTEs, schemas |
| `schema.` | the relations of that schema; `pg_catalog.` for the [`PgCatalog`](./schema#system-catalogs) slice |
| `alias.` or `table.` | the columns of that FROM item, with their types |
| `SELECT`, `WHERE`, `ON`, `AND`, `BY`, `RETURNING`, an operator, `(`, a comma in a list | the columns of every FROM item in scope, then their aliases |
| `INSERT INTO t (`, `UPDATE t SET`, `ON CONFLICT (` | the columns of `t` |

- Aliases follow scope: a subquery sees its own FROM items first, then the outer query's.
- Subqueries and CTEs offer the names of their output columns.
- Names that Postgres would fold to lower case or read as a keyword are inserted in double quotes (`"UserAccounts"`, `"order"`).
- Suggestions work in `sql()`, in `tx()` inside `sql.transaction()`, in `sql.fragment()` and `sql.as()`, in template literals across lines, and between `${sql.param()}` values.
- There are none inside string literals, comments and quoted identifiers.

## Syntax highlighting

The extension colors the SQL inside the string: keywords, types, functions, strings, comments, numbers, `$1` and `:name` parameters and `{slot}` fragments. The rest of the call stays TypeScript, and so does `${sql.param(…)}` inside a template literal.

| Highlighted | Example |
|---|---|
| a call of `sql`, `tx`, or a name ending in `Sql`, `SQL` or `_sql`, also as a member | `sql("…")`, `tx('…')`, `` db.sql(`…`) ``, `pgSql("…")` |
| `.fragment()` and `.as()` on those | `sql.fragment("…")`, `sql.as<Row>("…")` |
| any string after a `/* sql */` comment | `camel(/* sql */ "…")`, `const text = /* sql */ "…"` |

Only the first argument is SQL, and only when it is a string or template literal.

Highlighting reads the text, not the types. It needs neither the TypeScript 7 extension nor `@typesql/core`, and it also colors calls of other `sql` functions. If your `sql` has another name, such as `camel` or `admin`, put `/* sql */` before the string.

## How it works

The extension asks the TypeScript language server that is already running (no second TypeScript process) for the `DB` type of the `sql()` call at the cursor, and scans the text before the cursor for keywords, FROM items, aliases and CTEs. It never evaluates the statement's types, so a request usually takes 10 to 30 ms. A request that fails or takes longer than 150 ms adds nothing.

## Troubleshooting

- The **TypeSQL** output channel logs which `@typesql/core` and which TypeScript API client the extension uses, slow requests and errors. It also says so when the language server runs TypeScript 7.0, or when no client matches it.
- Suggestions you see without the extension, such as words from open files (the `abc` icon), come from VS Code. `"editor.wordBasedSuggestions": "off"` turns them off.
- With version 1.0 of the TypeScript 7 extension, the list also shows one item from TypeScript: the whole statement text, which would replace the string. That version doesn't let other extensions drop it; TypeScript 7.1's extension API does.
- After installing or upgrading `@typesql/core` or `typescript`, run **TypeScript: Restart TS Server** so the extension looks them up again.
- The TypeScript 7 extension's API is new in TypeScript 7.1 and may still change before 7.1 is final.
