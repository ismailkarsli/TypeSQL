# typesql

## 0.0.5

### Patch Changes

- Completions in `sql()` strings read more of the statement: a comma after `JOIN … ON …` or `JOIN … USING (…)` offers tables and one after `SELECT DISTINCT ON (…) a` or `ORDER BY a USING <` columns; `INSERT INTO t TABLE` offers tables and `FOR UPDATE` no longer does; `ON CONFLICT (…)` and `RETURNING` offer the target's columns after `INSERT … SELECT … UNION …`; and the columns of a subquery with `DISTINCT ON (…)` or a `{slot} alias` item are read right.

- Completions are no longer offered right after the closing quote of a statement literal that ends with an escaped backslash (`"…\\"`).

## 0.0.4

### Patch Changes

- The extension's README is shorter and links to the docs site for setup and troubleshooting.

- The extension bundles its completions instead of loading `@typesql/core/editor` from the project, which needs only `@typesql/core` in `node_modules`.

## 0.0.3

### Patch Changes

- SQL in `sql()`, `tx()`, `sql.fragment()` and `sql.as()` strings is highlighted: keywords, types, functions, strings, comments, `$1` and `:name` parameters and `{slot}` fragments, and a `/* sql */` comment highlights the string after it.

## 0.0.2

### Patch Changes

- The TypeScript 7 extension (`TypeScriptTeam.native-preview`) is no longer installed with TypeSQL: install it yourself, with its language server on TypeScript 7.1 or later.

## 0.0.1

### Patch Changes

- First release of the TypeSQL extension for VS Code: tables, views, schemas and columns (with their types) suggested inside `sql()` strings, on top of the TypeScript 7 extension with a TypeScript 7.1 language server.
