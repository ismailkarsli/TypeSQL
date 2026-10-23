# TypeSQL for VS Code

Completions inside [TypeSQL](https://typesql.karsli.net)'s `sql()` strings: tables, views and
schemas after `FROM` / `JOIN` / `INTO` / `UPDATE`, columns after `alias.` and in expressions,
with their Postgres types.

```ts
sql("SELECT * FROM |");          // users, posts, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

The names come from the `DB` type of the `sql` you call, so they follow your schema as you edit
it, unsaved changes included. Errors and row types still come from TypeScript, as without the
extension.

## Requirements

- The [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)
  (`TypeScriptTeam.native-preview`), with its language server on TypeScript 7.1 or later.
  Version 1.0 of the TypeScript 7 extension bundles TypeScript 7.0, which is not enough: add
  `typescript@7.1.0-beta` (or later) to the project and set
  `"js/ts.tsdk.path": "node_modules/typescript"` in `.vscode/settings.json`, then choose
  **Allow** when asked; or install the **TypeScript 7 Nightly** extension.
- `@typesql/core` 0.4.0 or later in the project, directly or through an adapter
  (`@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`,
  `@typesql/prisma`).

## Settings

- `typesql.completions.enable` (default `true`).

The **TypeSQL** output channel logs what the extension loads and any error. See
[Editor completions](https://typesql.karsli.net/guide/editor) for details.
