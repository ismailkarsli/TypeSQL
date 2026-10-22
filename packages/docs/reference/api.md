# API

## `createSql<DB, TypeMap = DefaultTypeMap>(executor?, options?)`

Returns the typed `sql` function for a schema. Pass the adapter's type map (`PgTypeMap`,
`PostgresJsTypeMap`) or use the adapter's pre-bound `createSql`. The optional `executor` is
what the queries' `execute*` methods run on; the adapters' `createSql` take the driver client
instead (`createSql<DB>(pool)`).

```ts
const sql = createSql<DB>();
const camel = createSql<DB>(executor, { rowKeys: "camelCase" }); // Sql<DB, DefaultTypeMap, "camelCase">
```

`options.rowKeys` is `"preserve"` (the default: rows keep Postgres' column names) or
`"camelCase"`: the rows' top-level keys are camelCased with `CamelCasePlugin`'s mapping, in the
row types and in the rows `execute*` return. See [camelCase row keys](../guide/queries#camelcase-row-keys).
`@typesql/pg`, `@typesql/postgres` (both `createSql` and `createBigIntSql`) and `@typesql/kysely`
take the same option after the client.

### `sql(text, ...params)`

`text` must be a string literal (or a template literal without substitutions). The
statement is parsed at compile time; the result is

```ts
Query<Row, Params, Text>   // { text: string; values: unknown[] } + phantom types
```

- `Row` is the projected row (`never` for DML without RETURNING and for DDL).
- `Params` is the tuple of parameter types: `WHERE id = $1` → `[number | null]`; INSERT value
  slots take the column type (`| null` when nullable); `LIMIT $1` → `number | null`;
  `$1::T` → `T`; `= ANY($1)` → array (elements accept `null`); a parameter with no context is
  `unknown`. See [Parameters](../guide/parameters#how-parameters-get-their-types).
- `Text` is the final SQL literal (after `:name` rewriting and fragment splicing).

An invalid statement makes the `text` parameter's type an `SqlError<message, tokenIndex>`,
so the error is reported on the SQL text:

```
Argument of type '"SELECT nme FROM users"' is not assignable to parameter of type
  '"SELECT nme FROM users" & SqlError<"column \"nme\" does not exist", 1>'.
```

### Named parameters

`:name` placeholders are rewritten to `$n` in order of first appearance; the call then takes
one object:

```ts
sql("SELECT id FROM users WHERE id = :id AND email = :email", { id: 1, email: "x" });
// text: "SELECT id FROM users WHERE id = $1 AND email = $2", values: [1, "x"]
```

`::` casts, `:=` and colons inside string literals are not parameters. Mixing `:name` and
`$n` in one statement is an error.

### Inline parameters

Values can be written where they are used, inside a template literal, with `sql.param()`:

```ts
const q = sql(`SELECT id, email FROM users
               WHERE id = ${sql.param(userId)} AND email = ${sql.param(email)}`);
// text:   "SELECT id, email FROM users WHERE id = $1 AND email = $2"
// values: [userId, email]
// type:   Query<{ id: number; email: string }, [number, string]>
```

- The value is always sent as a `$n` parameter, never as text. `param` is also exported
  standalone (`import { param } from "@typesql/core"`).
- Each value's TypeScript type is checked against the type its context gives the parameter:
  `${sql.param("5")}` compared with an `int4` column fails with
  `parameter $1: a string value cannot be used as int4 NOT NULL`; a `string | null` value for a
  `NOT NULL` column fails too. Strings are accepted for enum columns and any object for JSON,
  interval and other object-typed columns; with no context (`SELECT ${sql.param(x)}`) anything
  is accepted.
- Inline parameters are numbered after the statement's own parameters: `$n` and `:name`
  parameters keep `$1…$k` and stay call arguments; inline values follow; spliced fragments'
  values come last.
- `sql.param()` inside a quoted string or a comment is a compile error (and a runtime error).
- Tokens are single-use: each `sql.param()` call belongs to one statement. Fragments resolve
  their inline parameters when created, so a fragment can be reused.

Only literal SQL text is analysed. Interpolating anything that is not a compile-time constant
is rejected, so a value can never be pasted into the SQL by accident:

```ts
sql(`SELECT id FROM users WHERE email = '${userInput}'`);
//  error: the SQL text is not a string literal: pass values as parameters ($1, :name or
//         ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot}
//         fragments, or use sql.as<Row>() for dynamic SQL
const table = "users";
sql(`SELECT id FROM ${table}`);   // fine: a const is folded into the literal
```

Tagged templates (`` sql`…` ``) are not supported: TypeScript erases the text of a tagged
template from the types (TypeScript issue #33304), so nothing could be inferred.

### Fragments

```ts
const where = sql.fragment("WHERE u.id = $1", 7);          // Fragment<"WHERE u.id = $1", [unknown]>
const q = sql("SELECT u.id FROM users u {where}", { where });
// Query<{ id: number }, [number], "SELECT u.id FROM users u WHERE u.id = $1">
```

- `{name}` slots are replaced before inference; the fragment's `$n` are renumbered to follow
  the outer parameters (outer values first, then fragment values in order of appearance).
  Only `{identifier}` is a slot; `'{1,2}'` or `'{"a":1}'` inside literals are untouched.
- A fragment's parameters are typed once spliced (`WHERE u.id = $1` → `number` above), and
  the values it carries (positional, `:name` or inline) are checked against those types:
  `sql.fragment("AND age > $1", "eighteen")` spliced next to an `int4` column is an error.
- Whole queries are spliceable too (`WHERE id IN ({sub})`).
- `sql.id("col")` → `"col"`; `sql.id("schema", "table")` → `"schema"."table"`.
- `sql.join([f1, f2], " AND ")` keeps the literal text for tuple inputs; an array input is
  dynamic.
- `sql.list(items, separator = ", ")` joins a runtime array of fragments whose texts are
  literals (or unions of literals). The statement is checked once with each distinct element
  present once; the fragment's text type is that representative text. Throws on an empty
  array. See [Lists from runtime arrays](../guide/fragments#lists-from-runtime-arrays).
- `sql.raw(text)` is dynamic.
- A dynamic fragment makes the statement text non-literal; the call is rejected with
  `SqlError<"dynamic SQL fragment …">` — use `sql.as<Row>(text, slots, ...params)`.

### `sql.as<Row>(text, ...params)`

Bypasses inference and asserts the row type. Accepts slots and named parameters like `sql`.
`Row` is the row as returned: with `rowKeys: "camelCase"`, write it with camelCase keys.

### `q.execute()`, `q.executeTakeFirst()`, `q.executeTakeFirstOrThrow()`, `q.executeCount()`

Run a query on the executor bound by `createSql(executor)`, or on the one passed to the call
(`q.execute(executor(tx))` inside a transaction). Without either they reject.

| Method | Returns |
|---|---|
| `execute(executor?)` | `Promise<Row[]>` |
| `executeTakeFirst(executor?)` | `Promise<Row \| undefined>` |
| `executeTakeFirstOrThrow(executor?)` | `Promise<Row>`; `NoResultError` (with the statement `text`) on 0 rows |
| `executeCount(executor?)` | `Promise<number>`: the statement's row count |

`executeCount` returns the count from Postgres' command tag: rows affected by `INSERT`,
`UPDATE`, `DELETE` or `MERGE`, with or without `RETURNING`, and rows returned by `SELECT`.
Statements without a count, such as DDL, give 0.

An `Executor` is `(text, values) => PromiseLike<readonly unknown[] | ExecutorResult>`, where
`ExecutorResult` is `{ rows, rowCount: number | null }` (`null` means no count, read as 0).
Each adapter exports `executor(client)` to build one. The `@typesql/pg`, `@typesql/postgres` and
`@typesql/kysely` executors report `rowCount`. An executor that resolves to the rows alone (your
own, or `@typesql/prisma`'s) works for everything but `executeCount`, which then rejects. Use
`executeRaw` for Prisma counts. The methods are non-enumerable, so a query still deep-equals
`{ text, values }`.

Code that runs `q.text` itself, as the adapters' `query(client, q)` helpers do, calls
`mapRows(q, rows)` to apply the query's `rowKeys` to the driver's rows. `rowKeysOf(q)` returns the
option, and `camelCase(key)` is the key mapping.

## Public types

| Type | Meaning |
|---|---|
| `Query<Row, Params, Text>` | runtime query object with phantom types and `execute*` methods |
| `Executor` | `(text, values) => PromiseLike<readonly unknown[] \| ExecutorResult>`, what `execute*` runs on |
| `ExecutorResult` | `{ rows, rowCount: number \| null }`: an executor result with the statement's row count |
| `NoResultError` | thrown by `executeTakeFirstOrThrow` on 0 rows; carries `text` |
| `Sql<DB, TM, Keys = "preserve">` | the `sql` function; `Keys` is the `rowKeys` option |
| `SqlOptions`, `RowKeys` | `createSql`'s options; `"preserve" \| "camelCase"` |
| `CamelCase<S>`, `CamelCaseKeys<Row>`, `KeyedRow<Row, Keys>` | the key mapping on a string, on a row's top-level keys, and under a `rowKeys` option |
| `Fragment<Text, Params>` | spliceable SQL piece |
| `ListRep<Element, Sep>` | the representative text and carried values `sql.list` is checked with |
| `RowType<Q>`, `ParamsType<Q>`, `TextType<Q>` | extract from a `Query`/`Fragment` type |
| `InlineMarker<T>` | type of `sql.param(value)`: the inline marker encoding `T` |
| `RowOf<DB, TM, Q>` | row type of a statement literal |
| `ParamsOf<DB, TM, Q>` | positional parameter tuple |
| `ParamsArgs<DB, TM, Q>` | what a call site passes (tuple, or `[params: {…}]` for `:name`) |
| `NamesOf<DB, Q>` | `:name` parameters in order |
| `Validate<DB, Q>` | `Q` when valid, else `SqlError<message, tokenIndex>` |
| `Analyze<DB, Q>` | the full analysis result (`kind`, `cols`, `params`, `max`, `names`, `stmt`) |
| `ApplyDdl<DB, Q>` | schema after a DDL statement or a `;`-separated script |
| `SqlError<Message, At>` | compile-time error carrier; `At` is the index of the offending token |

## Schema types

```ts
Col<"text">                  // NOT NULL, no default
Nullable<"text">             // nullable
Generated<"int4">            // has a default / identity / serial → optional on INSERT
NullableGenerated<"text">
Arr<"int4">                  // int4[]
Enum<"mood">                 // values in DB["$types"]["mood"]
View<{ ...columns }>         // read-only relation
interface DB { users: {...}; auth: { sessions: {...} }; $types: { mood: "a" | "b" } }
```

Type names are Postgres names; spellings are normalized (`integer` → `int4`, `bigint` →
`int8`, `boolean` → `bool`, `timestamp with time zone` → `timestamptz`, `serial` → `int4`
with a default, …). Unknown names are kept as-is (user enums/domains) and resolve to
`DB["$types"]` or `unknown`.

## Type maps

A type map is `{ [pgTypeName]: TsType }`. Resolution order: exact entry (so a map may define
`"numeric[]": number[]`), then `T[]` element-wise, then `DB["$types"]`, then `unknown`.
Nullable columns add `| null`. `DefaultTypeMap` matches node-postgres defaults (`int8` and
`numeric` as `string`, dates as `Date`, `json/jsonb` as `unknown`).

Parameters accept the row type plus the map's `$params` entry for the type
(`TsParamTypeOf<TM, DB, T>`); array elements also accept `null`. A map without `$params` uses
`DefaultParamTypeMap` (`int8`/`numeric`/`money`: `number | bigint | string`; dates and
timestamps: `Date | string`; `interval`: `string`; `bytea`: `Uint8Array`). `PgTypeMap` and
`PostgresJsTypeMap` set `$params` to `PgParamTypeMap` and `PostgresJsParamTypeMap`.
`ParamTypeMapOf<TM>` is the input map in effect. See
[parameter types](../guide/schema#parameter-types).

## Function catalog

`FunctionCatalog` is an augmentable interface; add your own functions:

```ts
declare module "@typesql/core" {
  interface FunctionCatalog {
    my_func: Sig<["text", "int4"], "bool">;                 // strict: nullable if any arg is
    my_count: Sig<["any"], "int8", { agg: true; nullable: false }>;
  }
}
```

To review the catalog against a Postgres release, `scripts/catalog-from-pg.mjs` prints every
`pg_proc` overload of each catalog function (argument and return types, strict / aggregate /
window / set-returning flags) and lists catalog names Postgres does not have:

```sh
TYPESQL_PG_URL=postgres://postgres:x@localhost:5432/postgres node scripts/catalog-from-pg.mjs [names…]
```

Parameter patterns: exact type name, `any`, `anynumeric`, `anystring`, `anyarray`,
`anyjson`, `anydatetime`, `...` (variadic). Return patterns: exact name, `$1`..`$4`,
`$elem1`, `$arr1`, `$common`, `$sum1`, `$avg1`. Flags: `strict`, `nullable`, `agg`, `window`,
`srf`. Unknown functions are typed `unknown` (nullable); a cast fixes them.

## ORM packages

Each package wraps core's `createSql` with the schema converted from the ORM's types; see
[ORM schemas](../guide/orm-schemas).

| Package | `createSql` | Schema type | Runs queries |
|---|---|---|---|
| `@typesql/kysely` | `createSql<DB, TM = DefaultTypeMap, Overrides = {}, Options = {}>(db?, { rowKeys? })` | `FromKysely<DB, Overrides, Options>` | `query(db, q)` → `Row[]`, `execute(db, q)` → `number`; `q.execute()` with a bound `db` |
| `@typesql/drizzle` | `createSql<Schema, TM = DefaultTypeMap, Options = {}>(executor?)` | `FromDrizzle<Schema, Options>`; `pgType(column, "type")` pins a column | with a driver adapter, or `q.execute()` with an adapter's `executor(client)` |
| `@typesql/prisma` | `createSql<S, TM = PrismaTypeMap>(prisma?)`; `S` is a generated `DB` or a `Prisma.TypeMap` | `FromPrisma<Prisma.TypeMap, Overrides>`; the `typesql-prisma` generator | `queryRaw(prisma, q)` → `PrismaPromise<Row[]>`, `executeRaw(prisma, q)` → `PrismaPromise<number>`; `q.execute()` with a bound `prisma` |

Option and override types: `KyselyOverrides`, `KyselyOptions` (`camelCase`),
`FromDrizzleOptions` (`casing`, `timestamp`, `time`), `PrismaOverrides` (`$table`, `$schema`,
per-field `{ column, type, nullable, default }`). The generator's pieces are exported from
`@typesql/prisma/generator` (`generateSource`, `serveGenerator`).

## Limits

- Statement size: up to 4096 tokens (the generated `Next` table; regenerate with
  `node scripts/gen-next.mjs <n>` for more). 8 KB statements check in about a second.
- Left-nested `||` or `+` chains of ~100 terms hit TypeScript's instantiation depth;
  `AND`/`OR` chains are balanced by the parser and are fine at 200+ terms.
- For anything the engine rejects, `sql.as<Row>()` is the documented escape hatch.
