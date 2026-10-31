# TypeSQL for VS Code

Completions and syntax highlighting for the SQL inside [TypeSQL](https://typesql.karsli.net)'s `sql()` strings.

```ts
sql("SELECT * FROM |");
sql("SELECT u.| FROM users u");
```

- **Completions** for tables, views and schemas after `FROM`, `JOIN`, `INTO` and `UPDATE`, and for columns with their SQL types after `alias.` and in expressions. They come from your `DB` type and follow it as you edit, unsaved changes included.
- **Syntax highlighting** for keywords, types, functions, strings, `$1` parameters and more, in `sql()` and `tx()` strings, in migrations' `db.add()` and `db.raw()` statements, and in any string after a `/* sql */` comment.

Errors, hovers and row types come from TypeScript, with or without this extension.

## Requirements

Highlighting works on its own. Completions need:

- The [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview), running TypeScript 7.1 or later. Its version 1.0 bundles TypeScript 7.0, so [point it at TypeScript 7.1](https://typesql.karsli.net/guide/vscode#use-typescript-7-1) or install the **TypeScript 7 Nightly** extension.
- `@typesql/core` 0.4.0 or later in the project, directly or through an adapter.

Set `"typesql.completions.enable": false` to turn completions off. The **TypeSQL** output channel logs what the extension loads and any error.

See [VS Code extension](https://typesql.karsli.net/guide/vscode) for setup and troubleshooting.
