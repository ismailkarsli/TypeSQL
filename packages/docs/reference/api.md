# API

Everything `@typesql/core` exports, plus `@typesql/core/postgres`, `@typesql/core/adapter` and the extra exports of the adapter and ORM packages. Each entry links to the guide page that explains it.

`@typesql/core` holds what every SQL dialect shares: `createSql`, queries, fragments, executors, row keys, transactions, migrations, the schema markers and the [dialect contract](#dialects). Everything PostgreSQL-specific is in `@typesql/core/postgres`: the `postgres` dialect, the type engine, `Json` and `PgCatalog`, the type maps and the function catalog.

## `createSql`

```ts
import { createSql } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";

createSql<DB, TypeMap = DefaultTypeMap>(postgres, executor?, options?): Sql<DB, TypeMap, Keys>
```

Returns the typed `sql` function for a schema in a [dialect](#dialects).

- The dialect is the first argument: `postgres` from `@typesql/core/postgres`. Each dialect adds its own `createSql` signature, so the type arguments start with `DB`.
- `DB` is your [schema](../guide/schema). `TypeMap` turns the dialect's column types into TypeScript types ([Type mapping](./type-mapping)); it defaults to the dialect's map.
- `executor` is what `execute*` runs on. Without one, `sql` only builds queries.
- `options.rowKeys` is `"preserve"` (the default) or `"camelCase"`. See [camelCase row keys](../guide/queries#camelcase-row-keys).

The adapters export their own `createSql`, which takes the driver client and adds [`sql.transaction(fn)`](#sql-transaction-fn):

| Package | `createSql` |
|---|---|
| `@typesql/pg` | `createSql<DB>(pool, options?)`, with `PgTypeMap` |
| `@typesql/postgres` | `createSql<DB>(sql, options?)` with `PostgresJsTypeMap`, or `PostgresJsBigIntTypeMap` with `{ bigint: true }` |
| `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma` | see [ORM packages](#orm-packages) |

## `sql(text, ...params)`

Parses the statement at compile time and returns `Query<Row, Params, Text>`: `{ text, values }` plus phantom types.

| Type argument | Meaning |
|---|---|
| `Row` | the row type; `never` for `INSERT` / `UPDATE` / `DELETE` without `RETURNING`, and for DDL |
| `Params` | the tuple of parameter types ([how they are typed](../guide/parameters)) |
| `Text` | the final SQL literal, after `:name` rewriting and fragment splicing |

- `text` must be a string literal, or a template literal whose substitutions are compile-time constants. Anything else is an error ([Only literal SQL is analysed](../guide/parameters)).
- An invalid statement makes the `text` parameter's type `SqlError<message, tokenIndex>`, so the error shows on the SQL text ([Errors](../guide/errors)).
- Tagged templates (`` sql`…` ``) are not supported: TypeScript erases their text from the types.

### Named parameters

```ts
sql("SELECT id FROM users WHERE id = :id AND email = :email", { id: 1, email: "x" });
```

- `:name` becomes `$n` in order of first appearance, and the call takes one object. A name used twice is one parameter.
- `::` casts, `:=` and colons inside string literals are not parameters.
- Mixing `:name` and `$n` in one statement is an error.

## `sql.prepare(text, slots?)`

Compile a reusable query, then call it with the same parameter arguments that `sql(text, ...params)` accepts:

```ts
const findUser = sql.prepare("SELECT id, email FROM users WHERE id = $1");
const first = await findUser(1).executeTakeFirst();
const second = await findUser(2).executeTakeFirst();

const byEmail = sql.prepare("SELECT id FROM users WHERE email = :email");
await byEmail({ email: "a@example.com" }).execute();
```

Preparation resolves named parameters, inline values and fragment slots once. The returned function checks each binding's parameter types and returns a normal `Query` with all four `execute*` methods. Every binding gets a fresh values array. Inline and fragment values are captured at preparation; pass changing values as positional or named parameters. Captured objects retain their references.

With `@typesql/pg`, execution uses a server-side statement whose name is derived from the final SQL text. With `@typesql/postgres`, execution enables postgres.js preparation and extended protocol, including for queries without parameters; the client's global `prepare: false` setting still takes precedence. Preparation itself sends no SQL.

Other adapters and custom executors reuse TypeSQL's compiled query without requesting server preparation, unless their executor implements `prepare(text)`. The prepared query stays bound to the client or transaction that created it. Create it through `tx.prepare(...)` to execute in a transaction. An executor passed to `execute*` overrides that binding and runs through the supplied executor as usual.

Reuse the returned function across calls to save TypeSQL's runtime SQL assembly. Server preparation can also save repeated parsing, but performance depends on the query and workload; measure your application's repeated queries.

## Inline values

| Function | Sends |
|---|---|
| `sql.param(value)` | the value as a `$n` parameter, or `DEFAULT` when it is `undefined` |
| `sql.json(value)` | the value as JSON text; `null` and `undefined` as SQL `NULL` |

- The value's type is checked against the parameter's type. Strings are accepted for enums, objects for JSON and other object-typed columns, and anything when there is no context.
- Inline values are numbered after the statement's `$n` / `:name` parameters. Values carried by spliced fragments come last.
- Each `sql.param()` belongs to one statement. Inside quotes or a comment it is an error.
- `sql.json()` is an error unless the parameter is `json` / `jsonb` or has no context. A `Json<T>` column checks the value against `T`. A raw array for a JSON parameter is an error with `sql.param()` and as a call argument (`NonArrayOrSqlJson<T>`).
- A `sql.param()` value that can be `undefined` makes the statement be checked a second time with `DEFAULT` in its place, so it only fits a `VALUES` item or a `SET` value. `sql.fragment()` refuses such a value. `any` and `unknown` values are not checked.

See [Parameters](../guide/parameters), [JSON values](../guide/parameters#json-values) and [Optional values](../guide/writing-data#optional-values).

## Fragments

```ts
const where = sql.fragment("WHERE u.id = $1", 7);
const q = sql("SELECT u.id FROM users u {where}", { where });
```

| Function | Result |
|---|---|
| `sql.fragment(text, ...params)` | a piece of SQL to splice into a `{name}` slot |
| `sql.id("col")`, `sql.id("schema", "table")` | a quoted identifier: `"col"`, `"schema"."table"` |
| `sql.combine(items, options?)` | the fragments combined with `", "` by default: a tuple keeps its literal text, a runtime array of fragments with literal texts is checked as a list; throws when empty |
| `sql.raw(text)` | dynamic text, sent as is |

- Only `{identifier}` is a slot. Braces inside string literals are left alone.
- A fragment's `$n` are renumbered after the outer parameters, and its values are checked once spliced. Whole queries can be spliced too.
- `sql.id` over a union of names is checked once per member; the row type is the union. A generic name constrained to `RelationName<DB>` is widened to every table and view. Any other non-literal name is dynamic. Quoting prevents SQL syntax injection, but does not enforce authorization: dynamic names derived from untrusted user input must come from an explicit allowlist (e.g. to prevent selecting or sorting by sensitive fields like `password_hash`).
- `sql.combine` over an array checks the statement once, with each distinct element once ([Lists from runtime arrays](../guide/dynamic-sql#lists-from-runtime-arrays)). The `options.separator` value is raw SQL text: never pass untrusted user input as the separator.
- A dynamic fragment is rejected by `sql()`. Use `sql.as<Row>()`.

See [Dynamic SQL](../guide/dynamic-sql).

## Write helpers

| Function | Builds | Input type |
|---|---|---|
| `sql.set(table, values)` | `"a" = $1, "b" = $2` for the defined values; throws when none is defined | `SetInput<DB, TM, table>` |
| `sql.values(table, rows)` | `("a", "b") VALUES ($1, $2), ($3, DEFAULT)`; throws on an empty array | `InsertInput<DB, TM, table>` |

`table` is a `TableName<DB>`: a top-level table, or `"schema.table"`. It is used only for compile-time type checking. At runtime, every enumerable key on `values` or row objects becomes a column assignment or insert value. When handling untrusted inputs (such as `req.body`), pick allowed fields explicitly to prevent mass assignment. JSON columns take `sql.json(value)` or a raw non-array value. See [Inserting and updating](../guide/writing-data).

## `sql.as<Row>(text, ...params)`

Skips inference and uses the row type you give. It accepts slots, `:name` and inline values like `sql()`. With `rowKeys: "camelCase"`, write `Row` with camelCase keys. Use it for SQL TypeSQL can't type ([Errors](../guide/errors)).

## `sql.transaction(fn)`

Only on an adapter's `sql`. Runs `fn(tx)` in a transaction, where `tx` is the same `sql` bound to it.

- Commits and resolves to `fn`'s result when `fn` resolves. Rolls back and rethrows when it throws.
- `tx.transaction(fn)` nests with a savepoint.
- Rejects when the `sql` has no client.

See [Transactions](../guide/transactions).

## Running queries

| Method | Returns |
|---|---|
| `q.execute(executor?)` | `Promise<Row[]>` |
| `q.executeTakeFirst(executor?)` | `Promise<Row \| undefined>` |
| `q.executeTakeFirstOrThrow(executor?)` | `Promise<Row>`; rejects with `NoResultError` (carrying `text`) on 0 rows |
| `q.executeCount(executor?)` | `Promise<number>`: rows affected by `INSERT` / `UPDATE` / `DELETE` / `MERGE`, rows returned by `SELECT`, 0 for DDL |

The methods run on the executor passed to the call, or else on the one `createSql` bound. Without either, they reject. They are non-enumerable, so a query still deep-equals `{ text, values }`.

Every adapter reports the row count for `executeCount`: `rowCount` (`pg`), `count` (postgres.js), `numAffectedRows` or the number of rows (Kysely), `$executeRawUnsafe` (Prisma), and for Drizzle the count of the driver underneath.

### Executors

```ts
type Executor = (text: string, values: unknown[]) => PromiseLike<readonly unknown[] | ExecutorResult>;
type ExecutorResult = { rows: readonly unknown[]; rowCount: number | null };
```

- Each adapter exports `executor(client)`.
- `rowCount: null` means no count, read as 0.
- An executor that returns only rows works for everything but `executeCount`, unless it has a `count(text, values)` method.
- An optional `prepare(text): Executor` creates an executor for server preparation. It must defer database work until execution. `sql.prepare` calls it once with the final SQL text and binds all resulting queries to that executor, including its `count` method.

See [Custom executor](../adapters/custom-executor).

### `@typesql/core/adapter`

What adapters and custom executors build on.

| Export | Does |
|---|---|
| `mapRows(q, rows)` | applies the query's `rowKeys` option to the driver's rows, for code that runs `q.text` itself |
| `rowKeysOf(q)` | returns the query's `rowKeys` option |
| `camelCase(key)` | the camelCase key mapping |
| `createTransactionalSql(dialect, client, driver, options?)` | the dialect's `sql` bound to a driver's client, with `sql.transaction(fn)`; the PostgreSQL adapters pass `postgres` from `@typesql/core/postgres` |
| `SqlDriver<C>` | how a driver runs statements and transactions on its client `C` |
| `runTransaction(run, fn, options?)` | `BEGIN` / `COMMIT` / `ROLLBACK` (or a savepoint) around `fn`, for drivers without a transaction API |
| `JsonParam<T>` | the runtime value `sql.json()` binds: `{ value }` with `toPostgres()`, `toJSON()`, `toString()` |
| `positional(text, values, map?)` | rewrites `$n` parameters (outside strings, quoted names and comments) to `?` and returns the values in order, mapped by `map` (default `sqliteValue`), for SQLite drivers that bind positional parameters |
| `splitParams(text, values, map?)` | the statement split at its `$n` parameters: `{ parts, values }` |
| `paramNumbers(text)` | the parameter numbers a statement uses, in order of first use |
| `sqliteValue(value)` | a value as SQLite binds it: `sql.json()` values as JSON text, booleans as `1` / `0`; throws for a `Date` |

## Public types

### Queries and the `sql` function

| Type | Meaning |
|---|---|
| `Query<Row, Params, Text>` | the runtime query object, with phantom types and `execute*` methods |
| `Sql<DB, TM, Keys = "preserve">` | the `sql` function; `Keys` is the `rowKeys` option |
| `TransactionalSql<DB, TM, Keys = "preserve">` | an adapter's `sql`: `Sql` plus `transaction(fn)` |
| `SqlOptions`, `RowKeys` | `createSql`'s options; `"preserve" \| "camelCase"` |
| `Executor` | what `execute*` runs on |
| `ExecutorResult` | `{ rows, rowCount: number \| null }` |
| `NoResultError` | thrown by `executeTakeFirstOrThrow` on 0 rows; carries `text` |
| `RowType<Q>`, `ParamsType<Q>`, `TextType<Q>` | the row, parameters and text of a `Query` or `Fragment` type |
| `Fragment<Text, Params>` | a spliceable SQL piece |

### Tables and write helpers

| Type | Meaning |
|---|---|
| `TableName<DB>` | writable tables: top-level names and `"schema.table"` |
| `RelationName<DB>` | top-level tables and views (what a generic `sql.id(name)` is widened to) |
| `TableOf<DB, T>` | the column descriptors of a `TableName` |
| `SetInput<DB, TM, T>`, `InsertInput<DB, TM, T>` | what `sql.set` and a `sql.values` row accept |

### Statement analysis

| Type | Meaning |
|---|---|
| `RowOf<DB, TM, Q>` | the row type of a statement literal |
| `ParamsOf<DB, TM, Q>` | the positional parameter tuple |
| `Validate<DB, Q>` | `Q` when valid, else `SqlError<message, tokenIndex>` |
| `ApplyDdl<DB, Q>` | the schema after a DDL statement or a `;`-separated script |
| `SqlError<Message, At>` | the compile-time error carrier; `At` is the index of the offending token |

### `@typesql/core/postgres/engine`

The engine's other types are exported from `@typesql/core/postgres/engine`, so that a declaration file can name them: the markers `sql.param()` and `sql.json()` return, the representative texts of `sql.combine`, `sql.set` and `sql.values`, `Analyze` and `Analysis`, `ArgsOf`, `CamelCaseKeys`, the lexer and parser types, and so on. They change with the engine and are not a stable API.

## Schema types

```ts
Col<"text">
Nullable<"text">
Generated<"int4">
NullableGenerated<"text">
Arr<"int4">
Enum<"mood">
Json<Item[]>
View<{ ...columns }>
interface DB { users: {...}; auth: { sessions: {...} }; $types: { mood: "a" | "b" } }
type WithCatalog = DB & PgCatalog;
```

`Col`, `Nullable`, `Generated`, `NullableGenerated`, `Arr`, `Enum` and `View` are defined in `@typesql/core` and re-exported from `@typesql/core/postgres`, which adds `Json` and `PgCatalog`. A dialect lists its type names by augmenting `ColumnTypes`, so the editor completes them in `Col<"…">`.

`PgCatalog` is `{ pg_catalog: PgCatalogNamespace; information_schema: InformationSchemaNamespace }`. See [Declaring tables](../guide/schema) for type names and [System catalogs](../guide/schema#system-catalogs).

## Type maps

| Export | Meaning |
|---|---|
| `DefaultTypeMap` | node-postgres defaults; what core's `createSql` uses with `postgres` |
| `DefaultParamTypeMap` | what parameters accept when a map has no `$params` |
| `PgTypeMap`, `PgParamTypeMap` | `@typesql/pg` |
| `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap`, `PostgresJsParamTypeMap` | `@typesql/postgres` |
| `PrismaTypeMap` | `@typesql/prisma` |
| `ParamTypeMapOf<TM>` | the parameter map in effect for `TM` |
| `TsParamTypeOf<TM, DB, T>` | what a parameter of Postgres type `T` accepts |

The tables, the resolution order and custom maps are in [Type mapping](./type-mapping).

## Function catalog

A function call is looked up in this order:

1. `FunctionCatalog`: the built-in signatures, plus your augmentations.
2. `DB["$functions"]`: functions declared on the schema, or by `CREATE FUNCTION` in migrations.
3. The other `pg_catalog` functions: return type only, arguments not checked.

Schema qualification is ignored (`public.f(x)` is `f`). Any other name is an error. A known name whose overloads don't fit the arguments is `unknown` (nullable); a cast fixes it. How to declare your own functions is in [Expressions and functions](../guide/queries#expressions-and-functions).

```ts
interface DB {
  users: { … };
  $functions: { immutable_unaccent: Sig<["text"], "text"> };
}

declare module "@typesql/core/postgres" {
  interface FunctionCatalog {
    my_count: Sig<["any"], "int8", { agg: true; nullable: false }>;
  }
}
```

### Signatures

An entry is one `Sig<Params, Return, Flags>` or a tuple of overloads.

| Part | Values |
|---|---|
| Parameter patterns | an exact type name, `any`, `anynumeric`, `anystring`, `anyarray`, `anyjson`, `anydatetime`, `...` (variadic) |
| Return patterns | an exact name, `$1`..`$4`, `$elem1`, `$arr1`, `$common`, `$sum1`, `$avg1` |
| Typed-JSON return patterns | `$jval:json` (`to_json`), `$jarr:json` (`json_agg`), `$jrec:json` (`json_object_agg`), `$jtup:json` (`json_build_array`), `$jelem:json` (`json_array_elements`); `jsonb` for the jsonb variants |
| Flags | `strict` (the default: nullable if any argument is), `nullable`, `agg`, `window`, `srf` |

## Migrations

| Export | Meaning |
|---|---|
| `migrations<DB = {}>()` | a builder of DDL statements whose type tracks the schema (`@typesql/core/postgres`); a `PgMigrations<DB>` |
| `Migrations<T, DB>` | the builder class for dialect `T` (`@typesql/core`) |
| `SchemaOf<M>` | the schema of a builder |
| `runMigrations(client, m)` | runs `m.statements` in one transaction (`@typesql/core`) |
| `migrate(db, m)` | the same, from `@typesql/pg`, `@typesql/postgres` and `@typesql/sqlite` |

See [DDL support](./ddl#migrations) and [From migrations](../guide/migrations).

## Dialects

A dialect pairs the runtime that builds its `sql` function with that function's types: the `postgres` value (a `PostgresDialect`) and its `Postgres` types from `@typesql/core/postgres`, and the `sqlite` value (a `SqliteDialect`) and its `Sqlite` types from `@typesql/core/sqlite`.

| Export of `@typesql/core` | Meaning |
|---|---|
| `Dialect<T>` | the runtime side, what `createSql` takes: `{ name, valuesDefault? }`. Statements are built with `$n` parameters and sent as written. `valuesDefault: false` makes `sql.values()` throw instead of writing `DEFAULT` for a missing column |
| `DialectTypes` | the type side: its default `typeMap`, and given `db`, `tm`, `keys` and `ddl`, the `sql`, `transactionalSql`, `validateDdl` and `applyDdl` types |
| `SqlOf<T, DB, TM, Keys>`, `TransactionalSqlOf<T, DB, TM, Keys>` | the `sql` function of dialect `T`, without or with `transaction(fn)` |
| `ValidateDdlOf<T, DB, Q>`, `ApplyDdlOf<T, DB, Q>` | DDL checking and the schema after `Q`, in dialect `T` |
| `Transactional<Self>` | the `transaction(fn)` method an adapter's `sql` adds |
| `CreateSql` | the type of `createSql`. A dialect adds its call signatures by augmenting it, so `createSql<DB>(postgres)` picks PostgreSQL's from the `postgres` argument. A dialect without its own signatures uses the generic one: `createSql<T, DB>(dialect)` |

`SqlOf<Postgres, DB, TM>` is `Sql<DB, TM>`, and `TransactionalSqlOf<Postgres, DB, TM>` is `TransactionalSql<DB, TM>`; the same holds for `Sqlite` and the `Sql` and `TransactionalSql` of `@typesql/core/sqlite`.

`@typesql/core/sqlite` exports the same kinds of names as `@typesql/core/postgres`: `sqlite`, `Sql`, `TransactionalSql`, `RowOf`, `ParamsOf`, `Validate`, `ApplyDdl`, `migrations()` and `SqliteMigrations`, the write-helper types, the schema markers (`Col`, `Generated`, `Nullable`, `NullableGenerated`, `View`), and the type maps `DefaultTypeMap`, `BigIntTypeMap` and `DefaultParamTypeMap`. It also exports `ColFlags` (the [column flags](../guide/sqlite#column-flags)), `Json<T, Flags>` and `Typed<Type, T>` ([typed values](../guide/sqlite#typed-values)), and `Sig`, `SigFlags`, `FunctionRegistry` and the augmentable `FunctionCatalog` ([functions](../guide/sqlite#functions)). Its engine types are under `@typesql/core/sqlite/engine`. See [SQLite](../guide/sqlite).

## ORM packages

Each package wraps core's `createSql` with the schema converted from the ORM's types, and takes the dialect the same way. See [From Kysely, Drizzle or Prisma](../guide/orms).

| Package | `createSql` | Schema type | Runs queries |
|---|---|---|---|
| `@typesql/kysely` | `createSql(postgres, db, { rowKeys? })` with `DB` from `Kysely<DB>`, or `createSql<DB, TM = DefaultTypeMap, Overrides = {}, Options = {}>(postgres, db?, { rowKeys? })` | `FromKysely<DB, Overrides, Options>`; with `sqlite`, `FromKyselySqlite` | on a `Kysely` or `Transaction`, plugins bypassed |
| `@typesql/drizzle` | `createSql(postgres, db)` with the schema from `db`, or `createSql<Schema, TM = DefaultTypeMap, Options = {}>(postgres, db?)` | `FromDrizzle<Schema, Options>`; `pgType(column, "type")` pins a column. With `sqlite`, `FromDrizzleSqlite` and `sqliteType` | PostgreSQL: on the driver client under a node-postgres or postgres.js Drizzle database. SQLite: on the Drizzle database (`db.all` / `db.run`), any driver |
| `@typesql/prisma` | `createSql(postgres, prisma)` with the client's `Prisma.TypeMap`, or `createSql<S, TM = PrismaTypeMap>(postgres, prisma?)`; `S` is a generated `DB` or a `Prisma.TypeMap` | `FromPrisma<Prisma.TypeMap, Overrides>`; with `sqlite`, `FromPrismaSqlite` and `PrismaSqliteTypeMap`; the `typesql-prisma` generator | `$queryRawUnsafe` / `$executeRawUnsafe` on Prisma Client |

Each `createSql` has the same overloads with `sqlite` first; the type map then defaults to `DefaultTypeMap` of `@typesql/core/sqlite` (`PrismaSqliteTypeMap` for Prisma), and the SQL types are `KyselySqliteSql`, `DrizzleSqliteSql` and `PrismaSqliteSql`. See [SQLite](../guide/orms#sqlite).

| Option type | Fields |
|---|---|
| `KyselyOverrides` | per table and column: a type name or `{ type?, nullable?, hasDefault? }`; `$view: true` |
| `KyselyOptions` | `camelCase` |
| `FromDrizzleOptions` | `casing`, `timestamp`, `time` |
| `PrismaOverrides` | `$table`, `$schema`, per field `{ column, type, nullable, default }` |

`@typesql/prisma/generator` exports `generateSource(datamodel, options?)`, the source the `typesql-prisma` generator writes; `{ dialect: "sqlite" }` writes a SQLite schema.

## Introspection

`typesql introspect` (the bin of `@typesql/cli`) writes the schema of a live database. `--dialect postgres` (the default) reads PostgreSQL through `@typesql/pg`; `--dialect sqlite` (the default when `--db` is given) reads a SQLite file through `@typesql/sqlite`. See [From a live database](../guide/introspect) for the options. `@typesql/cli` also exports `main(argv)`, the command itself.

```sh
typesql introspect [--dialect postgres] [--url <url>] [--out <file>] [--schema <name>]… [--exclude <pattern>]… [--type-name DB]
                   [--import-from @typesql/core/postgres] [--config <file>] [--no-comments]
```

| Export of `@typesql/pg/introspect` | Meaning |
|---|---|
| `introspect(client, { schemas?, exclude?, viewNotNull? })` | `Promise<IntrospectedDatabase>`: `{ version, schemas, relations, enums }` |
| `generateSource(db, options?)` | the schema file's source; options `typeName`, `importFrom`, `imports`, `columnTypes`, `column`, `comments` |
| `IntrospectConfig` | the default export of a `--config` module: `url`, `out` and every option above |

`typesql introspect --dialect sqlite` writes the schema of a SQLite database file. See [Generate the schema](../adapters/sqlite#generate-the-schema).

```sh
typesql introspect --dialect sqlite --db <file> [--out <file>] [--exclude <pattern>]… [--type-name DB] [--import-from @typesql/core/sqlite]
```

| Export of `@typesql/sqlite/introspect` | Meaning |
|---|---|
| `introspect(db, { exclude? })` | `IntrospectedDatabase`: `{ version, relations }`, read from a node:sqlite, better-sqlite3 or bun:sqlite database |
| `generateSource(db, options?)` | the schema file's source; options `typeName`, `importFrom` |
