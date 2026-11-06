# @typesql/core

## 7.2.0

### Minor Changes

- CasePlugin takes options. `new CasePlugin({ to: "snake_case" })` gives snake_case row and write keys for camelCase columns, and `new CasePlugin({ nested: true })` also renames the keys inside JSON values, in rows and in `sql.json()`, `sql.param()`, `sql.set()` and `sql.values()`. A plugin can convert `sql.json()` values with the new optional `transformJson` hook and `json` type function.

## 7.1.0

### Minor Changes

- `@typesql/core/adapter` holds what the adapters share: connections (`connectPostgres`, `connectMysql`, `connectSqlite`), result normalisers (`pgResult`, `mysqlResult`), value encoders (`jsonText`, `mysqlBind`, `mysqlInline`, `sqliteBindings`), `pooledTransaction`, `createFamilySql`, the schema source writer (`schemaWriter`, `columnSource`, `doc`, …) and the `typesql introspect` shell (`introspectCommand`). `SqlDriver.transaction` also receives, after `client`, `depth` and `fn`, the name of the savepoint to make instead of a transaction of its own (`undefined` when none encloses the client), and a driver's optional `inTransaction(client)` tells that its client is a transaction already; drivers written for 7.0 keep working. A `Dialect` names the lexis of its SQL text (`lexis`). `@typesql/core/migration` exports `loadMigrator`, the config loading of `typesql migrate`.

- A PostgreSQL migration's `db` reads rows as the migrator's `pg` client returns them, with the new `NodePostgresTypeMap` from `@typesql/core/postgres`: `record`, `void`, `"char"[]` and `aclitem[]` values are strings and intervals have `toPostgres()`.

- `@typesql/core/adapter` exports `familyStatement`: a statement as a PostgreSQL, SQLite or MySQL driver takes it, with `$n` parameters or `?` placeholders.

- A new `@typesql/core/reserved` entry point exports each dialect's reserved words and the schema keys that name no table, for editor tooling such as `@typesql/language-server`. The parsers read the same word lists.

### Patch Changes

- A `Json<T>` value reads by one rule on every database: as `T`, unless the type map reads JSON as a `string`, as SQLite's maps do. A MySQL map with `json: string` (mysql2's `jsonStrings`) now reads `Json<T>` columns as text, and a SQLite map that reads JSON parsed reads them as `T`.

- MySQL and MariaDB: `WHERE x = ANY (SELECT …)` and `x <> SOME (SELECT …)` make `x` non-null, like `IN (SELECT …)`.

- A file that imports a type such as `Col` or `SchemaOf` from `@typesql/core` no longer loads the type declarations of every dialect's engine.

- TypeSQL reads MySQL, MariaDB and SQLite statements by their own rules: in `sql()`, `sql.fragment()`, `sql.raw()` and the `$n` rewriting of the MySQL and SQLite drivers, backtick- and bracket-quoted names, backslash escapes in MySQL strings, `#` comments and block comments, which these databases do not nest, no longer hide or invent `:name` parameters and inline values.

- The migrator binds MySQL and MariaDB values as `@typesql/mysql` does: a plain object is refused with `cannot bind [object Object] as a MySQL value; use sql.json() for JSON` instead of being written into the statement as SQL text. With a `url`, it also connects with the mariadb connector when mysql2 is not installed.

- In PostgreSQL, a cast array parameter such as `$1::text[]` has nullable elements, since it accepts and returns them: `SELECT x FROM unnest($1::text[]) AS x` gives `x: string | null`. A cast parameter that accepts `NULL` makes a column nullable in every `SELECT`; before, the result depended on whether the select list held a `$` or a comment. PostgreSQL migrations accept `CREATE FUNCTION` and `CREATE PROCEDURE` with a `BEGIN ATOMIC … END` body.

- MySQL, MariaDB and SQLite: `INSERT INTO t VALUES (…)` without a column list no longer types its parameters against the wrong columns when the schema has no `position` flags; it checks the number of values and types the parameters as `unknown`. The columns of an `ON DUPLICATE KEY UPDATE` row alias with a column list (`AS new(a, b)`) now follow the table's positions, and `FIRST` / `AFTER` in a migration's `ALTER TABLE` no longer invent positions for a table without them.

- `typesql migrate generate` writes a PostgreSQL JSON column a migration types with `Json<T>` (in `.raw<…>()`) as `Json<T, …>` with its import, like `typesql introspect`, instead of a schema file that does not compile.

- The schema files of `typesql migrate generate` and `typesql introspect --dialect sqlite` give the hidden columns of a virtual table (FTS5's table-named column and `rank`) `hasDefault: true`, as the schema a migration leaves does: an INSERT without a column list leaves them out.

- PostgreSQL: `Col<"char">`, as introspection writes it, and `"char"` in DDL and typed literals are the one-byte `"char"` type rather than `char(n)` (`bpchar`).

- On SQLite, which has no `DEFAULT` in a `VALUES` row, `sql.values` rows that give different columns, or a value that can be `undefined` where another row sends one, are a type error instead of a runtime error.

- The types of `sql()`, `sql.fragment()`, `sql.combine()`, `sql.and()` and `sql.or()` read MySQL, MariaDB and SQLite text by their own rules too: backtick- and bracket-quoted names, backslash escapes in MySQL strings, `#` comments, `--` without a following space in MySQL and block comments, which these databases do not nest, no longer make `sql()` require or number `:name` and `$n` parameters the database does not have.

- PostgreSQL: arrays with NULL elements keep `(T | null)[]` through `VALUES` and recursive CTEs, and a parameter combined with an aggregate under `GROUP BY ROLLUP`, `CUBE` or `GROUPING SETS` accepts `null`, since the total row's aggregate can be NULL.

- PostgreSQL: a `$functions` signature's `strict: [n]` checks arguments past the eighth, and an unknown function's message suggests the closest `pg_catalog` function too (`crc33` → `crc32`).

- SQLite: `x / - -0` (and `%`) is nullable, since `- -0` is zero, and `x / +2` is not.

- On the HTTP drivers (TiDB Cloud and PlanetScale serverless), a `'` in a value is written as `''`, so a value cannot end its string on a server with `NO_BACKSLASH_ESCAPES`. Backslashes in values are still corrupted in that mode.

- PostgreSQL: `CASE`, `COALESCE`, `UNION`, `JOIN … USING` and the other constructs that find a common type follow PostgreSQL's implicit casts: of two types that convert to each other the first is kept (`coalesce(oid_col, regclass_col)` is `oid`), and `"char"` with `text` or `time` with `interval` are reported as types that cannot be matched.

- PostgreSQL: `CASE`, `COALESCE`, `GREATEST`, `LEAST` and `ARRAY[]` over values with no common type are errors like `UNION` already was (`CASE types point and integer cannot be matched`), types such as `oid` and `integer` that convert implicitly combine instead of failing, and `= ANY(x)` rejects every non-array `x`.

- PostgreSQL: `jsonpath`, `regconfig`, `refcursor`, `pg_snapshot` and `txid_snapshot` values are typed `string`, as node-postgres and postgres.js return them, instead of `unknown`.

- The README and the npm description say how small the runtime is: under 3 kB minified and gzipped.

- PostgreSQL and SQLite: a `WHERE` condition that rejects NULL in a column of an outer-joined table gives all of that table's columns their declared nullability again, as MySQL already did (`LEFT JOIN posts p … WHERE p.title = $1` makes `p.id` non-null).

- `x NOT IN (SELECT …)`, `x <> ALL (…)` and SQLite's `x NOT IN ()` no longer make `x` non-null: they are true for a NULL `x` when the subquery or list is empty.

- A PostgreSQL or SQLite name with `$` in it (`a$b$`, `x$1`) is read as a name: in PostgreSQL `sql()` text, `a$b$` no longer opens a dollar quote that hid the `:name` parameters and inline values after it, and `x$1` is no longer counted or renumbered as parameter `$1` when a statement runs.

- PostgreSQL: a statement that reads or writes `"$types"`, `"$functions"` or `"$nullParams"` reports `relation "…" does not exist`, as PostgreSQL does, instead of `"…" is not a table`.

- On MySQL and MariaDB, a plain object for a JSON parameter is a type error, as the drivers refuse it at runtime: pass `sql.json(value)` or JSON text. An inline array or object for a JSON parameter there says `must be passed as sql.json(value)`, and MySQL and SQLite messages name a `Json<T>` column type `json` instead of printing its internal type.

- MySQL and MariaDB: the error for a JS array passed for a JSON parameter no longer mentions node-postgres; migration `ddl()` errors show the `SqlError` message instead of internal type names.

- In PostgreSQL, a function call holding a parameter in the values of `INSERT` or `MERGE` no longer fails with an "infinitely circular" error that turned later statements in the file into `any`, nor does `(f(x)).*`. `x = ANY(array)` and `x = ALL(array)` are nullable when the array can hold `NULL` elements. In migrations, `begin` and `end` used as names (`NEW.end`, `AS end`, a parameter or routine called `begin`) no longer hide a later `COMMIT` or reject a valid trigger, and `CASE … END FOR UPDATE` ends the `CASE`.

- `sql.withPlugin()` on the `sql` of `createSql()` keeps its dialect's type, as on the adapters' `sql`: its `.dialect`, and an `Sql<DB, TM, [CasePlugin]>` annotation, compile.

- PostgreSQL: a window name used inside `POSITION`, `SUBSTRING`, `TRIM` or `OVERLAY` must be defined, and a built-in function called with a number of arguments none of its overloads takes is an error (`function upper(text, text) does not exist`) instead of an `unknown` column.

- `typesql introspect --type-name`, `generateSource({ typeName })` and the Prisma generator's `typeName` reject a name that is not a TypeScript identifier (`typesql introspect` exits with 2) instead of writing a schema file that does not compile.

## 7.0.1

### Patch Changes

- The runtime is smaller: `@typesql/core` is about 2.9 kB minified and gzipped, down from 3.4 kB, with the same API. Some error messages are shorter, and runtime checks that only repeated a type error are gone (`sql.id()` with a non-string, `sql.values()` with a non-array, a prepared query called with the wrong number of parameters, `sql.param(undefined)`). The random marker prefix now always comes from `crypto.randomUUID()`: creating the first `sql.param()`, `sql.json()` or interpolated fragment where Web Crypto is unavailable, such as Cloudflare Workers' global scope, throws instead of falling back to `Math.random()`.

## 7.0.0

### Major Changes

- Breaking: `CasePlugin` and `CasePluginTypes` move from `@typesql/core` to the new `@typesql/core/plugins` entry, so applications that don't rename keys don't ship the plugin: `@typesql/core` is about 3.4 kB minified and gzipped. Change the import to `import { CasePlugin } from "@typesql/core/plugins"`; `.withPlugin(new CasePlugin())`, the renamed keys and their types are unchanged, and the custom-plugin types `SqlPlugin`, `PluginTypes`, `IdentityPluginTypes` and `InputContext` stay in `@typesql/core`.

### Patch Changes

- The runtime is smaller: `@typesql/core` is about 3.6 kB minified and gzipped, down from 5.2 kB, with the same API. Its error messages are shorter. Queries and fragments are now class instances, so `console.log(query)` prints `SqlQuery { text, values }`, and `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` and `executeCount()` are methods on their prototype: call them on the query rather than detaching them.

## 6.2.0

### Minor Changes

- Adds the `mysql` and `mariadb` dialects, from `@typesql/core/mysql`. `createSql<DB>(mysql)` and `createSql<DB>(mariadb)` type statements with MySQL's grammar (backtick names, `'…'` and `"…"` strings with backslash escapes, `#` comments), the types and nullability MySQL 8.4 and MariaDB 11.8 report for each expression, the result column names the servers use, and each server's own syntax and functions: `RETURNING` on MariaDB; `->`/`->>`, `LATERAL`, `VALUES ROW` and `TABLE` on MySQL. Schemas use MySQL's type names (`Col<"int unsigned", { autoIncrement: true }>`) and can declare `Enum<"a" | "b">`, `Json<T>` and `Typed<…>` columns, column positions, generated and invisible columns, and stored functions (`$functions`, `Sig`). `migration("mysql", …)` and `migration("mariadb", …)` define migrations with checked MySQL DDL (`CREATE TABLE`, `ALTER TABLE` with `FIRST`/`AFTER`, `CREATE VIEW`, `RENAME TABLE`, …), and `createMigrator({ dialect: "mysql" | "mariadb", url })` runs them through mysql2 under a `GET_LOCK` named lock; because MySQL commits DDL implicitly, a migration that fails after its DDL is reported as not rolled back. `sql.id()`, `sql.set()` and `sql.values()` quote names with the dialect's quote (`Dialect` gains `quote` and `emptyRow`), and `@typesql/core/adapter` adds `mysqlPositional` and `mysqlValue`.

## 6.1.4

### Patch Changes

- The README links to the new "Using `sql`" and Plugins pages of the documentation.

## 6.1.3

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

## 6.1.2

### Patch Changes

- Without `strictNullChecks`, every member of `sql` (such as `sql.begin`) reports the strictNullChecks requirement instead of returning `any`, and the built-in SQLite migration connection names the parameter it cannot bind.

- The README examples pass values inline with `${sql.param(value)}` (and `tx.param(value)` in transactions) instead of positional arguments.

## 6.1.1

## 6.1.0

### Minor Changes

- Every `sql` has a read-only `sql.dialect`, `"postgres"` or `"sqlite"`, typed as that literal, so libraries that take your `sql` can tell which database it runs on.

## 6.0.3

### Patch Changes

- The READMEs no longer link to an online playground.

## 6.0.2

### Patch Changes

- The README's example opens in the new TypeSQL Playground, which checks it with TypeScript 7.1 in the browser and shows its errors and row types, instead of the TypeScript Playground, which ran TypeScript 6.

## 6.0.1

### Patch Changes

- With `"skipLibCheck": false`, TypeSQL's own declarations type-check again in about a second, as before 5.0.4. Since 5.0.4 they took about 30 seconds and reported "Excessive complexity comparing types" (TS2859) errors in TypeSQL's files: a few with the default four checkers, and thousands, on the application's schema and queries too, with one checker (`--singleThreaded` or WebAssembly builds such as the tsrs playground).

## 6.0.0

### Major Changes

- An exported function that returns an unexecuted `sql()` or `sql.prepare()` query again compiles with `declaration: true` (or `composite`) when the type map, plugin types or plugin classes are not exported: a query is typed `Query<Row, Params, Text>` again, as before 5.0.2, instead of `InferredQuery<…>`, which is no longer exported.

## 5.0.4

### Patch Changes

- Statements type-check with about 10% fewer type instantiations, mostly in parameter checks, fragment interpolation, sql.values and sql.set, and parsing.

## 5.0.3

### Patch Changes

- Reduce type-checking work when validating SQL expressions and inferring parameter types.

## 5.0.2

### Patch Changes

- Reduce type-checking work by sharing query contexts, collecting parameter hints independently, and deferring generic index arithmetic.

## 5.0.1

### Patch Changes

- The documentation reflects migration tracking and locking, supported driver and editor versions, and the current query APIs.

## 5.0.0

### Major Changes

- Query inference, migrations and database adapters share smaller implementations while retaining the supported SQL workflows.

### Minor Changes

- Migration contexts run checked DDL with `db.ddl(…)`; `db.add(…)` still works as a deprecated alias.

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
