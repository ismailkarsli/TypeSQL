# @typesql/core

## 1.0.1

### Patch Changes

- Accept `sql.json()` over a recursive JSON type such as zod's `z.core.util.JSONType`, which failed with TS5115 ("Instantiations of the following types appear infinitely circular").

- Copy a `$` that is not followed by digits, as in the regex `'[0-9]+$'` or a `$body$` dollar quote, through unchanged when a fragment is spliced into a query, and leave `$n` inside strings, quoted identifiers, comments and dollar quotes alone when counting and renumbering parameters, instead of failing with TS2589 or an "unterminated quoted string" error.

## 1.0.0

### Major Changes

- Remove the Arr, Nullable, Generated and NullableGenerated schema helpers: write Col<"int4[]">, Col<"text", { nullable: true }>, Col<"int4", { hasDefault: true }> and Col<"text", { nullable: true; hasDefault: true }> instead.

### Patch Changes

- Update the README Playground examples to write columns with Col options instead of the removed Nullable and Generated helpers.

## 0.10.1

### Patch Changes

- Accept readonly arrays for PostgreSQL array parameters, so inline array literals work in sql.set and sql.values and as const arrays work as arguments.

- Type a UNION, INTERSECT or EXCEPT column as nullable when a SELECT * branch has a nullable column, which was ignored.

- Reject more SQL that PostgreSQL rejects before running: aggregate and window functions in WHERE, nested aggregates, window calls inside aggregates, true/false/NULL in GROUP BY and ORDER BY, $0, and CASE, COALESCE, GREATEST and LEAST branches whose types cannot be matched.

- Accept SQL spellings such as Col<"integer">, "bigint", "boolean", "character varying" and "timestamp with time zone" in hand-written PostgreSQL schemas, which were typed unknown.

- Accept a slot holding a union of fragments with different parameter counts, such as flag ? sql.fragment("AND id = $1", 1) : sql.fragment("AND true"), by checking each fragment with its own parameters.

- Report an error in the next migration when a migration's up() doesn't return its context, instead of silently turning off checking.

- Leave {name} inside string literals, quoted identifiers, comments and dollar quotes alone instead of treating it as a fragment slot, so '{k}'::text[] and jsonb paths like '{k}' compile, and stop E'…' strings with escaped quotes from breaking :name parameters.

- Parse node-postgres arrays of enums, domains and extension types such as citext, which pg returns as raw {…} strings, so they match their array types.

- Let CasePlugin writes use a column's own snake_case name when its camelCase name wouldn't convert back to it, so columns like address_line_1 can be written.

- Allow an outer query's aggregate in a subquery's WHERE, keep CASE and COALESCE over oid, reg* and domain types compiling, and avoid excessive-depth errors on long || chains from the new aggregate checks.

- Accept TypeScript 7.1 prereleases such as 7.1.0-beta in the peer range, and load TypeScript only when typesql migrate hashes a migration file, so --help works without it.

- Fix the README Playground links, which opened with module resolution that ignores package exports and showed no TypeSQL errors or types.

- Type window aggregates as nullable when their frame can be empty (both bounds before or after the current row, or EXCLUDE CURRENT ROW / GROUP), which returned NULL while typed non-null.

- SQLite: accept excluded.* in an upsert's DO UPDATE … WHERE, reject OVER name without a matching WINDOW definition, and know FTS5's bm25, highlight and snippet plus median, percentile, percentile_cont, percentile_disc, unistr and json_array_insert.

- Type NUMERIC-affinity SQLite columns (numeric, decimal, boolean) as number | bigint under BigIntTypeMap, since bigint mode returns their integral values as bigint.

- Accept sql.json() values in sql.set, sql.values and inline for SQLite json columns, which were rejected because those columns read as JSON text.

- Reject queries on a transaction's tx after its callback has settled, instead of running them outside the transaction on a released connection.

- Type $n parameters inside a SELECT's WITH queries, which accepted any value.

## 0.10.0

### Minor Changes

- Replace rowKeys options and casing helpers with typed input and output plugins and CasePlugin.

### Patch Changes

- Convert camelCase write objects through CasePlugin in sql.values and sql.set.

- Add sql.empty as a callable sentinel for optional fragments and DEFAULT parameters; sql.param now rejects undefined.

- Build camelCase writes and single-row inserts faster without changing generated SQL.

- Reject unsupported migration dialects instead of treating them as SQLite.

## 0.9.2

### Patch Changes

- Speeds up PostgreSQL query type checking and runtime query construction without caching.

- Fix excessive type instantiation when extracting PostgreSQL query row types.

## 0.9.1

### Patch Changes

- Removes the type cache and runtime memoization so queries and migrations are always inferred directly.

## 0.9.0

### Minor Changes

- Run tracked PostgreSQL and SQLite migrations with typed schema evolution, transactional execution, and runtime-code integrity checks.

## 0.8.1

### Patch Changes

- Type cache files written by an earlier version are rebuilt on first use.

- Adds SQLite. `createSql<DB>(sqlite)` from `@typesql/core/sqlite` types SQLite statements with SQLite's grammar, type affinity, nullability and result column names, and `migrations()` derives the schema from SQLite DDL. Schemas can declare functions (`$functions`, `Sig`, an augmentable `FunctionCatalog`), JSON documents (`Json<T>`), literal-typed columns (`Typed<"text", T>`) and `Col` flags for column position, `INTEGER PRIMARY KEY`, generated and hidden columns; a misspelled table, column or function suggests the closest name, and the type cache serves SQLite statements too. The new `@typesql/sqlite` package runs queries on node:sqlite, better-sqlite3 and bun:sqlite (`createSql<DB>(db)`, savepoint transactions, `{ bigint: true }`, `migrate(db, m)`). The Kysely, Drizzle and Prisma packages accept `createSql(sqlite, db)`, converting their SQLite schemas (`FromKyselySqlite`, `FromDrizzleSqlite`, `FromPrismaSqlite`, `PrismaSqliteTypeMap`), and the `typesql-prisma` generator writes a SQLite schema for the `sqlite` provider. Editor completions work in SQLite statements. Breaking: the `typesql` command moves from `@typesql/pg` to the new `@typesql/cli`, where `typesql introspect --dialect postgres|sqlite` reads a PostgreSQL database (the default) or a SQLite file (`--db app.db`); `@typesql/pg/introspect` and `@typesql/sqlite/introspect` export the introspection and `main`. The `sql` function, projections and write helpers are now shared by all dialects: `Dialect` gains `valuesDefault` (`sql.values()` throws instead of writing `DEFAULT` without it), and `@typesql/core/adapter` adds `positional`, `splitParams`, `paramNumbers` and `sqliteValue` for drivers that bind positional parameters.
