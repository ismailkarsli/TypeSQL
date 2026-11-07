# typesql

## 3.1.2

### Patch Changes

- SQL completions and highlighting reconnect after the connection to the TypeScript language server is lost, instead of failing until a restart, and a lost connection no longer crashes the language server. A statement cut off while typing, such as `WITH a;`, no longer changes the completions of the next statement.

## 3.1.1

### Patch Changes

- Without semantic highlighting, names, `:name` parameters, casts and `$tag$` strings with non-ASCII letters are colored, and `--` or `/*` right after an operator starts a comment.

- Completions work in `sql.prepare()` and `sql.raw()` strings, and in a migration's `db()`, `.ddl()`, `.add()` and `.raw()` strings. With semantic highlighting, SQLite strings are colored as SQLite (`[name]` and backtick names, `?`, `@name` and `$name` parameters), and PostgreSQL strings as PostgreSQL: backslash escapes in `E'…'` strings, and `#` and backticks as operators, not a comment and a name. In SQLite, completions after `main.` or `temp.` list the tables, with those the statement uses first.

## 3.1.0

### Minor Changes

- Completion and highlighting in MySQL and MariaDB statements: names are quoted with backticks, and `#` comments, backtick names and `"…"` strings are highlighted.

## 3.0.3

### Patch Changes

- SQL in strings is highlighted in shades of coral instead of teal, which TypeScript types also use in the default themes, with at least 7:1 contrast on common themes. The icon and the Marketplace header are rose to match.

## 3.0.2

### Patch Changes

- The extension shows the TypeSQL logo as its icon in the Marketplace and the Extensions view, and its Marketplace page has a matching teal header.

- SQL in strings is highlighted in shades of teal, TypeSQL's color, instead of orange, in dark and light themes.

## 3.0.1

### Patch Changes

- The documentation reflects migration tracking and locking, supported driver and editor versions, and the current query APIs.

## 3.0.0

### Major Changes

- SQL highlighting and completion reuse shared scanning and session helpers.

### Patch Changes

- Highlights SQL in a migration's `db.ddl(…)` statements, as in `db.add(…)` and `db.raw(…)`.

## 2.0.0

### Major Changes

- Require VS Code 1.144 or newer and update extension tooling.

## 1.0.0

### Major Changes

- Stop coloring `{name}` as a fragment slot, since `{name}` slots were removed from `sql()`; interpolated `${fragment}` holes stay TypeScript, and completion treats a hole in a `FROM` clause as a relation.

## 0.1.1

### Patch Changes

- SQL that only type checking colors, such as camel("…") from createSql, now takes the same colors as the SQL the text rules color, including your editor.tokenColorCustomizations changes, instead of the theme's keyword, function and type colors.

## 0.1.0

### Minor Changes

- SQL in sql() strings is now colored in shades of orange, so it stands out from the TypeScript around it: keywords, types, functions, numbers, $1 and :name parameters and {slot} fragments, and table and column names, with separate shades for themes whose ID contains Dark or Light and for both built-in high contrast themes; strings and comments keep the theme colors, and an editor.tokenColorCustomizations rule under your theme ID, or empty textMateRules under [*Dark*][Default High Contrast] and [*Light*], changes or turns off the colors.

## 0.0.11

### Patch Changes

- With the TypeScript 7 extension, types decide what is SQL: strings of TypeSQL calls are highlighted under any name, such as camel("…") from createSql or users("INSERT …") in a migration, and other functions' strings that look like SQL, such as your own sql("…"), stay plain; set typesql.semanticHighlighting.enable to false to keep highlighting by name only.

- Highlight SQL in migration files: db.add(…), db.raw<Schema>(…) and migrations().add(…) strings that start like a SQL statement, and stop TypeScript colors after a member call such as db.mySql("…") from leaking into the following lines.

## 0.0.10

### Patch Changes

- Highlight SQL in member calls such as db.sql.fragment("…") and this.db.sql.as<Row>("…").

## 0.0.9

### Patch Changes

- Reads current schemas for SQL completions without caching their results.

## 0.0.8

### Patch Changes

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.

## 0.0.7

### Patch Changes

- The README says completions show each column's SQL type, without tying the wording to PostgreSQL.

## 0.0.6

### Patch Changes

- Reorganize core internals and remove source comments and inline API documentation without changing SQL behavior.

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
