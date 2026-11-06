---
description: "The TypeSQL VS Code extension: completion of table and column names and syntax highlighting inside SQL strings."
---

# VS Code extension

The TypeSQL extension for VS Code completes table and column names inside your SQL strings, and highlights the SQL.

```ts
sql("SELECT * FROM |");
sql("SELECT u.| FROM users u");
```

The names come from the `DB` type of the `sql` you call, so they follow your schema as you edit it, unsaved changes included.

The extension requires VS Code 1.144 or newer. It is optional: errors, hovers and row types come from TypeScript, with or without it.

## Setup

1. Install the TypeSQL extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql) or [Open VSX](https://open-vsx.org/extension/typesql/typesql). Install the [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview) (`TypeScriptTeam.native-preview`) too. The TypeScript 7 extension is published only on the Visual Studio Marketplace, not on Open VSX, so in VSCodium and other Open VSX editors you get SQL highlighting but no completions unless you install it from a `.vsix`.
2. Have `@typesql/core` 0.4.0 or later in the project, directly or through an adapter (`@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite`, `@typesql/mysql`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`).
3. Run the language server on TypeScript 7.1 or later, as below.

### Use TypeScript 7.1

Version 1.0 of the TypeScript 7 extension bundles TypeScript 7.0, whose API cannot read the editor's program. Its version picker also does not list a workspace `typescript` package. You have two options.

**Option 1: the project's TypeScript.** Add TypeScript 7.1 to the project:

```sh
pnpm add -D typescript@7.1.0-beta
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
- Names that the database would fold to lower case or read as a keyword are inserted in double quotes (`"UserAccounts"`, `"order"`). In MySQL and MariaDB statements, names that need quoting get backticks (`` `order` ``).
- Suggestions work in `sql()`, in `tx()` inside `sql.transaction()`, in `sql.fragment()`, `sql.prepare()`, `sql.raw()` and `sql.as()`, in a migration's `db()`, `.ddl()`, `.add()` and `.raw()`, in template literals across lines, and between `${sql.param()}` values.
- There are none inside string literals, comments and quoted identifiers.

## Syntax highlighting

The extension colors the SQL inside the string: keywords, types, functions, strings, comments, numbers, and `$1` and `:name` parameters. The rest of the call stays TypeScript, and so does every `${…}` inside a template literal, such as `${sql.param(…)}` or an interpolated fragment.

| Highlighted | Example |
|---|---|
| a call of `sql`, `tx`, or a name ending in `Sql`, `SQL` or `_sql`, also as a member | `sql("…")`, `tx('…')`, `` db.sql(`…`) ``, `pgSql("…")` |
| `.fragment()` and `.as()` on those | `sql.fragment("…")`, `sql.as<Row>("…")` |
| `.ddl()`, `.add()` and `.raw()`, when the string starts like a SQL statement | `` db.ddl(`CREATE TABLE …`) ``, `db.raw<Next>("…")` |
| any string after a `/* sql */` comment | `camel(/* sql */ "…")`, `const text = /* sql */ "…"` |

Only the first argument is SQL, and only when it is a string or template literal.

These rules read the text, so they color as soon as you type and need neither the TypeScript 7 extension nor `@typesql/core`. `.ddl()` and `.raw()` cover [migrations](./migrations), and so does `.add()`, the earlier name of `.ddl()`. Because other objects have methods with these names too, their string counts only when it starts with a statement keyword followed by a space, `;` or `(` (`CREATE TABLE`, `alter table`, `DO $$`), with a `(`, or with a comment. A template literal whose first line is empty also counts.

### By type

With the TypeScript 7 extension and `@typesql/core` in the project, the extension then checks each call's type and corrects the colors, so in the end only TypeSQL's functions are SQL:

- A call is SQL when its function comes from TypeSQL, whatever its name: `const camel = createSql<DB>(postgres)` makes `camel("…")` SQL, and in a migration so does `users("INSERT …")` on the context that `db.ddl()` returns. Their `.fragment()`, `.as()`, `.prepare()` and `.raw()` are SQL too, and so are `.ddl()` and `.add()` on a migration context.
- A call that the rules above color but that isn't TypeSQL's, such as your own `sql()` function or `set.add("drop it")`, goes back to a plain string.
- Strings after `/* sql */` stay SQL either way.

The corrections are [semantic tokens](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide): they appear a moment after an edit, and need a theme with semantic highlighting (Dark+, Light+ and most popular themes have it; `"editor.semanticHighlighting.enabled": true` turns it on for others). Set `"typesql.semanticHighlighting.enable": false` to keep only the text rules.

### Colors

The SQL is colored in shades of coral, a hue that the default themes don't use for TypeScript, so it stands out from the code around it:

| Token | Example | Scope | Dark themes | Light themes |
|---|---|---|---|---|
| keywords and operators | `SELECT`, `=`, `::` | `keyword.other.sql`, `keyword.operator.sql`, `keyword.operator.cast.sql` | `#FDA4AF` | `#A51034` |
| types | `int4`, `text` | `storage.type.sql` | `#FDBA9A` | `#8A2E10` |
| functions | `count(…)` | `entity.name.function.sql` | `#F0ABFC` | `#86198F` |
| numbers and constants | `42`, `true`, `null` | `constant.numeric.sql`, `constant.language.sql` | `#FED7AA` | `#7F1D1D` |
| parameters, in bold | `$1`, `:name` | `variable.parameter.positional.sql`, `variable.parameter.named.sql` | `#F9A8D4` | `#A1144F` |
| table and column names, punctuation | `users`, `u.id` | `meta.embedded.line.sql`, `meta.embedded.block.sql` | `#FFE4E6` | `#4C0519` |

Strings and comments keep your theme's colors, and so does TypeScript inside `${…}`.

The colors are a default value of `editor.tokenColorCustomizations` under the keys `[*Dark*][Default High Contrast]` and `[*Light*]`, so they apply to the themes whose ID (the value of `workbench.colorTheme`) contains `Dark` or `Light`, with that case: Dark Modern, Dark+, Light Modern, Light+, Solarized Light, One Dark Pro and others. Dark High Contrast (ID `Default High Contrast`) gets the dark shades and Light High Contrast (ID `Default High Contrast Light`) the light ones. Themes with neither word in their ID, such as Monokai, Abyss and Dracula, keep their own colors.

Strings that only type checking colors, such as `camel("…")` from `createSql`, get the same colors. Their semantic tokens carry the `definition` modifier, which TypeScript doesn't use, and the extension maps each one to the scope in the table, such as `keyword.definition` to `keyword.other.sql`, so the rules above and your changes to them apply. A theme with its own semantic color for a token type, such as `keyword` or `function` under `semanticTokenColors`, colors these tokens with it instead.

#### Change or turn off the colors

VS Code merges your `editor.tokenColorCustomizations` into these defaults key by key, but a `textMateRules` list that you set under `[*Dark*][Default High Contrast]` or `[*Light*]` replaces the default list under that same key. Rules under a theme key apply after rules without one, and the last matching rule wins.

To change a color, add a rule under your theme's ID. It comes after the defaults, so it wins:

```jsonc
{
  "editor.tokenColorCustomizations": {
    "[Dark Modern]": {
      "textMateRules": [
        { "scope": "keyword.other.sql", "settings": { "foreground": "#569CD6" } }
      ]
    }
  }
}
```

A rule at the top level, outside a `[…]` key, doesn't change the coral tokens, because the theme-specific defaults apply after it.

To turn the colors off, set empty lists under both keys:

```jsonc
{
  "editor.tokenColorCustomizations": {
    "[*Dark*][Default High Contrast]": { "textMateRules": [] },
    "[*Light*]": { "textMateRules": [] }
  }
}
```

If your settings already have a `textMateRules` list under `[*Light*]`, it replaces the coral for light themes; add the rules from the table to it to keep them. A list under another key, such as `[*Dark*]`, adds to the defaults instead. To color the SQL in a theme with neither word in its ID, add the rules under that theme's ID, such as `[Monokai]`. **Developer: Inspect Editor Tokens and Scopes** shows the scope of the token under the cursor.

## How it works

The extension asks the TypeScript language server that is already running (no second TypeScript process) for the `DB` type of the `sql()` call at the cursor, and scans the text before the cursor for keywords, FROM items, aliases and CTEs. It never evaluates the statement's types, so a request usually takes 10 to 30 ms. A request that fails or takes longer than 150 ms adds nothing. For highlighting, it reads the types of every call with a string argument in one request each time TypeScript sends the file's semantic tokens, and adds its tokens to them. That usually takes under 50 ms; a request that takes longer than 500 ms keeps TypeScript's tokens as they are.

## Troubleshooting

- The **TypeSQL** output channel logs which `@typesql/core` and which TypeScript API client the extension uses, slow requests and errors. It also says so when the language server runs TypeScript 7.0, or when no client matches it.
- Suggestions you see without the extension, such as words from open files (the `abc` icon), come from VS Code. `"editor.wordBasedSuggestions": "off"` turns them off.
- With version 1.0 of the TypeScript 7 extension, the list also shows one item from TypeScript: the whole statement text, which would replace the string. That version doesn't let other extensions drop it; TypeScript 7.1's extension API does.
- After installing or upgrading `@typesql/core` or `typescript`, run **TypeScript: Restart TS Server** so the extension looks them up again.
- The TypeScript 7 extension's API is new in TypeScript 7.1 and may still change before 7.1 is final.
