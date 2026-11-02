# @typesql/core

## 4.0.1

### Patch Changes

- Check inline SQLite JSON writes against declared column shapes, including sql.set and sql.values.

- Standardize installation instructions on pnpm and document packaged consumer validation.

- Handle nested PostgreSQL block comments when scanning parameters and splicing fragments.

- Decode duplicate PostgreSQL output names using the final column's type in the pg adapter.

- Build packages with the updated TypeScript toolchain and dependency type definitions.

## 4.0.0

### Major Changes

- Replace the migration APIs with one migrator: `migration(from, { name, up, down })` from `@typesql/core/migration` defines a migration that starts from `"postgres"`, `"sqlite"` or the previous migration, and `createMigrator({ dialect, url | db | execute, migrationsDir | migrations })` runs a directory of files or an array with `latest()`, `up()`, `down()`, `status()`, `make()` and `generate()`, also in Bun, Deno and Cloudflare Workers (an array with `execute`; `transaction: false` for D1). The migrator carries the schema after the last migration, inferred from an array or given as `createMigrator<DB>()`: `SchemaOf<typeof migrator>`, or `SchemaOf<typeof result>` of what `latest()` returns. A migration that fails rejects with a `MigrationError` that names it and lists the migrations the call applied before it. Applied migrations are tracked by name only, a file's name in a directory and a migration's `name` in an array, and no longer by a hash of the file: an edited applied migration is not an error, and a 3.x history works as it is. `migrateUp`, `migrateDown`, `migrateLatest`, `discoverMigrations`, `migrationHash`, `MigrationSchema` (use `SchemaOf`), the `Migrations` builder with `migrations()` of `@typesql/core/postgres` and `/sqlite`, `runMigrations` and `MigrationClient` are removed, and `SchemaOf` takes a migration.

### Patch Changes

- SQLite: after ALTER TABLE … DROP COLUMN, SELECT *, RETURNING * and INSERT … VALUES keep the columns after the dropped one.

- A plain parameter value can no longer take another statement's pending `sql.param()` or `sql.json()` value: every marker carries its own random id, and `sql.param()` and `sql.json()` reject a value that holds another one, as a type error and at runtime, so a marker's text is no longer stored in the database.

- Accept an unqualified column in a SQLite upsert's `DO UPDATE SET` and `WHERE`, as in `ON CONFLICT (name) DO UPDATE SET n = n + 1`: it names the target table's column, as in SQLite, and was rejected as an ambiguous column name. `excluded.n` still names the proposed row.

- The README links to the new upgrade guide and changelog pages of the docs site.

- Columns with different `Col` options are no longer assignable to each other: `Col<"int8", { nullable: true }>` to `Col<"int8">`, or a SQLite column with `rowid`, `generated`, `hidden` or `position` to one without. Nor is an `sql` for one schema, type map, plugin list or dialect assignable to one for another: `const sql: Sql<DB, DefaultTypeMap> = createSql<OtherDB>(postgres)` is an error.

- Type array elements built from nullable values as nullable: `array_agg(body)` over a nullable column (with `ORDER BY`, `DISTINCT`, `FILTER` or `OVER` too) is now `(string | null)[]` instead of `string[]`, and so are `ARRAY[…]` and `ARRAY(SELECT …)` with a nullable item, `array_append`, `array_prepend`, `array_cat`, `array_replace`, `array_fill` and `||` with a nullable element, `string_to_array` with a null string, and `regexp_match` and `regexp_matches`, whose unmatched groups are `NULL`. Casts such as `array_agg(x)::varchar[]`, `coalesce`, `CASE`, `UNION`, subqueries and outer joins keep the nullable elements, `unnest` of such an array is nullable, and `array_agg(x) FILTER (WHERE x IS NOT NULL)` keeps non-null elements.

- Start a Cloudflare Worker that imports `@typesql/core`, or builds a query with `sql.param()` or a fragment in its global scope: the random prefix of inline values and fragments is now made on first use instead of when the module loads. A first use in global scope, where Workers forbid `crypto.getRandomValues()`, takes `Math.random()`'s values, and the first use in a handler switches to a prefix from crypto.

- Report the SqlError of an invalid statement called with arguments again, as in `sql("SELECT emial FROM users WHERE id = $1", 1)`, with `$1` or `:name` parameters, instead of `Expected 1 arguments, but got 2`; the function `sql.prepare()` returns for such a statement no longer adds an argument-count error either.

- Type-check SQLite schemas built by many statements much faster: a history of 300 `CREATE TABLE` migrations checks in about 5 seconds instead of 42, and 300 `ALTER TABLE … ADD COLUMN` migrations on one table no longer run out of memory, because each column type is built from plain values and a table's column order is read in one pass.

- Without `strictNullChecks` (`"strict": true` turns it on), every `sql()` call, migration query and migration `.add()` is an error saying TypeSQL requires it, instead of "Type instantiation is excessively deep" (TS2589), `any` rows and misleading errors.

## 3.0.0

### Major Changes

- Leave the table out of `sql.set(values)` and `sql.values(rows)`: the fragment is checked against the target of the `UPDATE` or `INSERT` it is interpolated into, and `sql.values` also checks the statement with only the keys every row always sends, so a required column a row can leave out is still an error. A plugin's `transformInput` context then has `table: null`, so `InputContext["table"]` is now `string | null`.

- Replace `sql.empty` with `sql.optional(value)`, whose argument is required: it returns the value, or for `undefined` an omission that sends `DEFAULT` in `sql.param()`, is skipped by `sql.combine`, `sql.and` and `sql.or`, and splices nothing when an optional fragment or query is interpolated as `${…}`. `null` is returned as is and stays SQL `NULL`, as in `sql.set`, `sql.values` and `sql.json`, and a fragment or query that can be `null` is a compile error. Write `sql.optional(value ?? undefined)` for `sql.empty(value)` and `value ?? sql.empty`, `sql.optional(value)` where `null` should stay `NULL`, and `sql.optional(undefined)` for a bare `sql.empty`. Add `sql.if(value, then)`, which returns the fragment or query `then(value)` builds when `value` is truthy, with `value` narrowed to its truthy type, and the same omission otherwise, as in ``sql.and([sql.if(search, (s) => sql.fragment(`"name" ILIKE ${sql.param(s)}`))])``.

- Interpolate fragments into the SQL template: every `sql.*` fragment (`sql.fragment`, `sql.id`, `sql.combine`, `sql.and`, `sql.or`, `sql.set`, `sql.values`, `sql.raw`) and a whole query can be written as `${fragment}` in `sql()`, `sql.prepare()`, `sql.as()` and `sql.fragment()`, and the statement is checked with the fragment spliced in, nested queries included. `{name}` slots and the slot-map argument are removed: replace `sql("… {where}", { where }, ...params)` with ``sql(`… ${where}`, ...params)``, and `sql.prepare(text, slots)` with `sql.prepare(text)`; a `{name}` left in the SQL is now a syntax error. Fragment and `Query` types are also string types, so a fragment or query passed as a parameter value, to `sql.param()` or to `sql.id()` throws.

### Patch Changes

- Reject comparisons PostgreSQL has no operator for, between numbers, strings, booleans, date/time values, intervals, `uuid` and `bytea` of different kinds, as in `id = email` or `id IN (SELECT title FROM posts)`: `=`, `<>`, `<` and the other comparison operators, `IS DISTINCT FROM`, `IN` lists and subqueries, `ANY`/`ALL` subqueries and row comparisons now give `operator does not exist: integer = text`, as PostgreSQL does. Literals, parameters, enums, arrays and domains are still accepted.

- Type statements with deeply nested subqueries that have a `LIMIT` or `OFFSET` parameter, as in `limit ${sql.param(1)}` three or more levels down, which failed with TS5115 "Instantiations … appear infinitely circular": parameter inference no longer nests the parameters found so far into each level, and skips `ORDER BY` handling when there is no `ORDER BY`.

- Remove unused engine helpers and redundant internal exports.

- Number the parameters right in the text, row and parameter types of a statement or fragment with several union fragments, such as two conditional pieces that each carry a value: the later piece's parameters were numbered as if every earlier piece were present and absent at once, while the statement itself was checked correctly.

## 2.0.1

### Patch Changes

- Parse a parenthesized subquery used as an operand inside parentheses, as in `((SELECT 1) - 1)`, and reject `first_value`, `last_value`, `nth_value`, `lag`, `lead` and `any_value` of an untyped literal or `NULL`, as PostgreSQL does.

- Type as nullable a column that uses a cast parameter accepting `null`, such as `upper($1::text)` or `coalesce($1::date)`; the aggregates `stddev`, `stddev_samp`, `variance`, `var_samp`, `corr`, `covar_samp`, `regr_intercept`, `regr_r2` and `regr_slope`, which return `NULL` for a single row; `to_char` of a date, timestamp or interval; and `collation for` of an untyped literal or `NULL`.

- Infer parameters in window `PARTITION BY` and `ORDER BY`, named `WINDOW` clauses, `DISTINCT ON` and a query's `ORDER BY`, which were left untyped. They accept `null`, as in `ORDER BY abs(extract(epoch from at - $1::timestamptz))`, unless another use of the parameter rejects it.

## 2.0.0

### Major Changes

- `sql.json(undefined)` now sends `DEFAULT` like `sql.param(sql.empty)` instead of SQL `NULL` (`sql.json(null)` still sends `NULL`): inline, a `sql.json()` value that can be `undefined` is only accepted where `DEFAULT` is; as a positional or named argument it is a compile error and throws; and `sql.set` and `sql.values` leave the column out, as they do for `undefined`.

### Patch Changes

- Check inline `sql.param()` and `sql.json()` values, and values in fragments, `sql.set` and `sql.values`, against literal and object types: a value that does not fit a `Json<T>` column's `T` or an enum, such as `sql.json({ theme: "blue" })` for `{ theme: "dark" | "light" }`, is now an error that names the expected type, while a plain `string`, `number` or `boolean` is still checked only for its kind.

- The README no longer links to the removed performance guide.

## 1.1.0

### Minor Changes

- Add `sql.and([...])` and `sql.or([...])`, which combine conditions with `AND` or `OR` in parentheses, skip `sql.empty` items, give `true` or `false` when no condition is left, and keep the statement type-checked like `sql.combine`; editors no longer suggest `" AND "` and `" OR "` as `sql.combine` separators.

### Patch Changes

- `@typesql/core`, `@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`, `@typesql/sqlite` and `@typesql/cli` now share one version number and are released together: install them all at the same version.

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
