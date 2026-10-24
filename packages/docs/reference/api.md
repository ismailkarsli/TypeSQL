# API

Everything `@typesql/core` exports, plus the extra exports of the adapter and ORM packages. Each entry links to the guide page that explains it.

## `createSql`

```ts
createSql<DB, TypeMap = DefaultTypeMap>(executor?, options?): Sql<DB, TypeMap, Keys>
```

Returns the typed `sql` function for a schema.

- `DB` is your [schema](../guide/schema). `TypeMap` turns Postgres types into TypeScript types ([Type mapping](./type-mapping)).
- `executor` is what `execute*` runs on. Without one, `sql` only builds queries.
- `options.rowKeys` is `"preserve"` (the default) or `"camelCase"`. See [camelCase row keys](../guide/queries#camelcase-row-keys).

The adapters export their own `createSql`, which takes the driver client and adds [`sql.transaction(fn)`](#sql-transaction-fn):

| Package | `createSql` |
|---|---|
| `@typesql/pg` | `createSql<DB>(pool, options?)`, with `PgTypeMap` |
| `@typesql/postgres` | `createSql<DB>(sql, options?)` with `PostgresJsTypeMap`; `createBigIntSql<DB>(sql, options?)` with `PostgresJsBigIntTypeMap` |
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
// text: "SELECT id FROM users WHERE id = $1 AND email = $2", values: [1, "x"]
```

- `:name` becomes `$n` in order of first appearance, and the call takes one object. A name used twice is one parameter.
- `::` casts, `:=` and colons inside string literals are not parameters.
- Mixing `:name` and `$n` in one statement is an error.

## Inline values

| Function | Sends |
|---|---|
| `sql.param(value)` (also `param`) | the value as a `$n` parameter |
| `sql.json(value)` (also `json`) | the value as JSON text; `null` and `undefined` as SQL `NULL` |
| `sql.valueOrDefault(value)` (also `valueOrDefault`) | the value, or `DEFAULT` when it is `undefined` |

- The value's type is checked against the parameter's type. Strings are accepted for enums, objects for JSON and other object-typed columns, and anything when there is no context.
- Inline values are numbered after the statement's `$n` / `:name` parameters. Values carried by spliced fragments come last.
- Each `sql.param()` belongs to one statement. Inside quotes or a comment it is an error.
- `sql.json()` is an error unless the parameter is `json` / `jsonb` or has no context. A `Json<T>` column checks the value against `T`. A raw array for a JSON parameter is an error with `sql.param()` and as a call argument (`NonArrayOrSqlJson<T>`).
- With `sql.valueOrDefault()`, a value that can be `undefined` makes the statement be checked a second time with `DEFAULT` in its place.

See [Parameters](../guide/parameters), [JSON values](../guide/parameters#json-values) and [Optional values](../guide/writing-data#optional-values-sql-valueordefault).

## Fragments

```ts
const where = sql.fragment("WHERE u.id = $1", 7); // Fragment<"WHERE u.id = $1", [unknown]>
const q = sql("SELECT u.id FROM users u {where}", { where });
// Query<{ id: number }, [number], "SELECT u.id FROM users u WHERE u.id = $1">
```

| Function | Result |
|---|---|
| `sql.fragment(text, ...params)` | a piece of SQL to splice into a `{name}` slot |
| `sql.id("col")`, `sql.id("schema", "table")` | a quoted identifier: `"col"`, `"schema"."table"` |
| `sql.join([f1, f2], separator)` | the fragments joined; literal text only for a tuple written in place |
| `sql.list(items, separator = ", ")` | a runtime array of fragments with literal texts, joined; throws when empty |
| `sql.raw(text)` | dynamic text, sent as is |

- Only `{identifier}` is a slot. Braces inside string literals are left alone.
- A fragment's `$n` are renumbered after the outer parameters, and its values are checked once spliced. Whole queries can be spliced too.
- `sql.id` over a union of names is checked once per member; the row type is the union. A generic name constrained to `RelationName<DB>` is widened to every table and view. Any other non-literal name is dynamic.
- `sql.list` checks the statement once, with each distinct element once ([Lists from runtime arrays](../guide/dynamic-sql#lists-from-runtime-arrays)).
- A dynamic fragment is rejected by `sql()`. Use `sql.as<Row>()`.

See [Dynamic SQL](../guide/dynamic-sql).

## Write helpers

| Function | Builds | Input type |
|---|---|---|
| `sql.set(table, values)` | `"a" = $1, "b" = $2` for the defined values; throws when none is defined | `SetInput<DB, TM, table>` |
| `sql.values(table, rows)` | `("a", "b") VALUES ($1, $2), ($3, DEFAULT)`; throws on an empty array | `InsertInput<DB, TM, table>` |

`table` is a `TableName<DB>`: a top-level table, or `"schema.table"`. JSON columns take `sql.json(value)` or a raw non-array value. See [Inserting and updating](../guide/writing-data).

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

See [Custom executor](../adapters/custom-executor).

### Running `q.text` yourself

| Function | Does |
|---|---|
| `mapRows(q, rows)` | applies the query's `rowKeys` option to the driver's rows |
| `rowKeysOf(q)` | returns the query's `rowKeys` option |
| `camelCase(key)` | the camelCase key mapping |

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
| `CamelCase<S>`, `CamelCaseKeys<Row>`, `KeyedRow<Row, Keys>` | the key mapping on a string, on a row's top-level keys, and under a `rowKeys` option |

### Fragments and inline values

| Type | Meaning |
|---|---|
| `Fragment<Text, Params>` | a spliceable SQL piece |
| `ListRep<Element, Sep>` | the representative text and carried values `sql.list` is checked with |
| `InlineMarker<T>` | the type of `sql.param(value)` |
| `DefaultMarker<T>` | the type of `sql.valueOrDefault(value)` |
| `JsonMarker<T>` | the type of `sql.json(value)` |
| `JsonValue` | any `sql.json()` value: what a json / jsonb argument, `set` or `values` value accepts besides raw values |
| `JsonParam<T>` | the runtime value `sql.json()` binds: `{ value }` with `toPostgres()`, `toJSON()`, `toString()` |

### Tables and write helpers

| Type | Meaning |
|---|---|
| `TableName<DB>` | writable tables: top-level names and `"schema.table"` |
| `RelationName<DB>` | top-level tables and views (what a generic `sql.id(name)` is widened to) |
| `TableOf<DB, T>` | the column descriptors of a `TableName` |
| `SetInput<DB, TM, T>`, `InsertInput<DB, TM, T>` | what `sql.set` and a `sql.values` row accept |
| `SetRep<P>`, `ValuesRep<R>` | the representative text and carried values of `sql.set` / `sql.values` |

### Statement analysis

| Type | Meaning |
|---|---|
| `RowOf<DB, TM, Q>` | the row type of a statement literal |
| `ParamsOf<DB, TM, Q>` | the positional parameter tuple |
| `ArgsOf<DB, TM, Q>` | the tuple a call site passes: `ParamsOf`, with json / jsonb parameters as `NonArrayOrSqlJson<T>` |
| `ParamsArgs<DB, TM, Q>` | what a call site passes: `ArgsOf`, or `[params: {…}]` for `:name` |
| `NamesOf<DB, Q>` | the `:name` parameters in order |
| `Validate<DB, Q>` | `Q` when valid, else `SqlError<message, tokenIndex>` |
| `Analyze<DB, Q>` | the full analysis result (`kind`, `cols`, `params`, `max`, `names`, `stmt`); never served from the type cache |
| `Analysis<DB, Q>` | what `RowOf`, `ParamsOf` and `Validate` read: `Analyze` without `stmt`, from the [type cache](../guide/performance#type-cache) when it has a usable entry |
| `ApplyDdl<DB, Q>` | the schema after a DDL statement or a `;`-separated script |
| `SqlError<Message, At>` | the compile-time error carrier; `At` is the index of the offending token |
| `QueryCache`, `QueryCacheKeys`, `CacheSnapshots`, `DdlCache`, `DdlCacheKeys`, `CacheVersion`, … | what a [type cache](../guide/performance#type-cache) file declares; generated, not written by hand |

## Schema types

```ts
Col<"text">                  // NOT NULL, no default
Nullable<"text">             // nullable
Generated<"int4">            // has a default / identity / serial: optional on INSERT
NullableGenerated<"text">    // both
Arr<"int4">                  // int4[]
Enum<"mood">                 // values in DB["$types"]["mood"]
Json<Item[]>                 // jsonb holding Item[]; Json<T, { nullable: true }, "json"> for json
View<{ ...columns }>         // read-only relation
interface DB { users: {...}; auth: { sessions: {...} }; $types: { mood: "a" | "b" } }
type WithCatalog = DB & PgCatalog;  // opt-in pg_catalog / information_schema slice
```

`PgCatalog` is `{ pg_catalog: PgCatalogNamespace; information_schema: InformationSchemaNamespace }`. See [Declaring tables](../guide/schema) for type names and [System catalogs](../guide/schema#system-catalogs).

## Type maps

| Export | Meaning |
|---|---|
| `DefaultTypeMap` | node-postgres defaults; what core's `createSql` uses |
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
  $functions: { immutable_unaccent: Sig<["text"], "text"> }; // this schema only
}

declare module "@typesql/core" {
  interface FunctionCatalog {
    my_count: Sig<["any"], "int8", { agg: true; nullable: false }>; // every schema
  }
}
```

### Signatures

An entry is one `Sig<Params, Return, Flags>` or a tuple of overloads. `FunctionRegistry` is the type of a `$functions` entry.

| Part | Values |
|---|---|
| Parameter patterns | an exact type name, `any`, `anynumeric`, `anystring`, `anyarray`, `anyjson`, `anydatetime`, `...` (variadic) |
| Return patterns | an exact name, `$1`..`$4`, `$elem1`, `$arr1`, `$common`, `$sum1`, `$avg1` |
| Typed-JSON return patterns | `$jval:json` (`to_json`), `$jarr:json` (`json_agg`), `$jrec:json` (`json_object_agg`), `$jtup:json` (`json_build_array`), `$jelem:json` (`json_array_elements`); `jsonb` for the jsonb variants |
| Flags | `strict` (the default: nullable if any argument is), `nullable`, `agg`, `window`, `srf` |

## Migrations

| Export | Meaning |
|---|---|
| `migrations<DB = {}>()` | a builder of DDL statements whose type tracks the schema |
| `SchemaOf<M>` | the schema of a builder |
| `runMigrations(client, m)` | runs `m.statements` in one transaction (`@typesql/core`) |
| `migrate(db, m)` | the same, from `@typesql/pg` and `@typesql/postgres` |

See [DDL support](./ddl#migrations) and [From migrations](../guide/migrations).

## ORM packages

Each package wraps core's `createSql` with the schema converted from the ORM's types. See [From Kysely, Drizzle or Prisma](../guide/orms).

| Package | `createSql` | Schema type | Runs queries |
|---|---|---|---|
| `@typesql/kysely` | `createSql<DB, TM = DefaultTypeMap, Overrides = {}, Options = {}>(db?, { rowKeys? })` | `FromKysely<DB, Overrides, Options>` | on a `Kysely` or `Transaction`, plugins bypassed |
| `@typesql/drizzle` | `createSql<Schema, TM = DefaultTypeMap, Options = {}>(db?)` | `FromDrizzle<Schema, Options>`; `pgType(column, "type")` pins a column | on the driver client under a node-postgres or postgres.js Drizzle database |
| `@typesql/prisma` | `createSql<S, TM = PrismaTypeMap>(prisma?)`; `S` is a generated `DB` or a `Prisma.TypeMap` | `FromPrisma<Prisma.TypeMap, Overrides>`; the `typesql-prisma` generator | `$queryRawUnsafe` / `$executeRawUnsafe` on Prisma Client |

| Option type | Fields |
|---|---|
| `KyselyOverrides` | per table and column: a type name or `{ type?, nullable?, hasDefault? }`; `$view: true` |
| `KyselyOptions` | `camelCase` |
| `FromDrizzleOptions` | `casing`, `timestamp`, `time` |
| `PrismaOverrides` | `$table`, `$schema`, per field `{ column, type, nullable, default }` |

The Prisma generator's pieces are exported from `@typesql/prisma/generator` (`generateSource`, `serveGenerator`).

## Introspection

`typesql introspect` (the bin of `@typesql/pg`) writes the schema of a live database. See [From a live database](../guide/introspect) for the options.

```sh
typesql introspect [--url <url>] [--out <file>] [--schema <name>]… [--exclude <pattern>]… [--type-name DB]
                   [--import-from @typesql/core] [--config <file>] [--no-comments]
```

| Export of `@typesql/pg/introspect` | Meaning |
|---|---|
| `introspect(client, { schemas?, exclude?, viewNotNull? })` | `Promise<IntrospectedDatabase>`: `{ version, schemas, relations, enums }` |
| `generateSource(db, options?)` | the schema file's source; options `typeName`, `importFrom`, `imports`, `columnTypes`, `column`, `comments` |
| `main(argv)` | the CLI; returns the exit code |
| `IntrospectConfig` | the default export of a `--config` module: `url`, `out` and every option above |
| `ViewNullability`, `parseNodeTree` | the view column nullability analysis |
