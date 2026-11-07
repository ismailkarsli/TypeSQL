# @typesql/language-server

## 1.2.0

### Minor Changes

- `@typesql/language-server/format` exports `formatSql()`, the SQL formatter of `typesql format`. SQL highlighting tokenizes names faster.

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.5.0

## 1.1.5

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.4.1

## 1.1.4

### Patch Changes

- SQL completions and highlighting reconnect after the connection to the TypeScript language server is lost, instead of failing until a restart, and a lost connection no longer crashes the language server. A statement cut off while typing, such as `WITH a;`, no longer changes the completions of the next statement.

- Updated dependencies:
  - @typesql/core@7.4.0

## 1.1.3

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.3.0

## 1.1.2

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.2.0

## 1.1.1

### Patch Changes

- Completions work in `sql.prepare()` and `sql.raw()` strings, and in a migration's `db()`, `.ddl()`, `.add()` and `.raw()` strings. SQLite strings are read as SQLite: `[name]` and backtick names, `?`, `?1`, `@name` and `$name` parameters, and block comments that don't nest; and `FROM main.` and `FROM temp.` list the tables, as their columns already resolved. In PostgreSQL, backslash escapes in `E'…'` strings no longer end the string early. Names that need quoting come from `@typesql/core`'s keyword lists.

- The package ships its type declarations, which read an optional `typescript` peer (7.1 or later), and exports only its main entry point (the `typesql-language-server` command stays). In SQLite, completions after `main.` or `temp.` list the tables the statement uses first, as after `public.` in PostgreSQL.

- Updated dependencies:
  - @typesql/core@7.1.0

## 1.1.0

### Minor Changes

- Completes tables and columns in `sql` calls of `@typesql/core/mysql`, quoting names that need it with backticks and understanding index hints, `STRAIGHT_JOIN`, `REPLACE INTO` and `ON DUPLICATE KEY UPDATE`, and highlights MySQL statements by MySQL's rules: `#` comments, backtick names, `"…"` strings with backslash escapes and `@var` variables.

## 1.0.2

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

## 1.0.1

### Patch Changes

- The exported `TypeScriptModules` type accepts the `SyntaxKind` enum of `typescript/ast` as it is, reverse mapping included, without a cast.

## 1.0.0

### Major Changes

- SQL highlighting and completion reuse shared scanning and session helpers.

### Patch Changes

- Highlights SQL in a migration's `db.ddl(…)` statements by their type, as in `db.add(…)` and `db.raw(…)`.

## 0.0.11

### Patch Changes

- Use pnpm in the language-server installation instructions.

- Build packages with the updated TypeScript toolchain and dependency type definitions.

## 0.0.10

### Patch Changes

- Remove unused completion exports and an unused development dependency.

- Stop coloring `{name}` as a fragment slot in `sql()` strings, since `{name}` slots were removed from `@typesql/core`, and treat an interpolated `${…}` hole in a `FROM` clause as a relation when completing columns.

## 0.0.9

### Patch Changes

- mergeTokens takes the whole semantic tokens legend and a map from each highlight kind to a token type with modifiers, such as "keyword.definition", and highlights add constant, escape, slot and punctuation kinds so every character of a SQL string gets a token.

## 0.0.8

### Patch Changes

- Add Session.highlight, which returns SQL highlights for the strings of TypeSQL calls in a file by their type, and mergeTokens, which adds them to a semantic tokens response.

## 0.0.7

### Patch Changes

- Treat a completion request without a result as TypeScript's null instead of failing, so Neovim configs that drop a nil result still get TypeSQL completions.

- Log which TypeScript version was found when the project's TypeScript is too old for completions, instead of "no TypeScript 7.1 package found".

- Complete SQL in core's createSql(dialect).withPlugin(…), after ${sql.param("x")} and after a /* sql */ marker; escape quoted names inserted into "…" and '…' strings; and complete columns after an escaped \"Quoted\" table.

## 0.0.6

### Patch Changes

- Resolves packages and completion schemas afresh without caching their results.

## 0.0.5

### Patch Changes

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.
