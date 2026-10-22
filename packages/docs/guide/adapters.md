# Adapters

`@typesql/core` is type-only: `sql("SELECT …", …params)` returns `{ text, values }` plus phantom
`Row`/`Params` types. An adapter adds two things for one driver:

1. a **type map** (`PgTypeMap`, `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap`) describing how
   that driver's *default* parsers turn each Postgres type into a JS value;
2. a `createSql<DB>(client)` that uses that map and runs the queries on `client`, with
   `sql.transaction(fn)` for transactions.

The client parameters are structural, so fakes work in tests without the driver.

## Running queries

Pass the client to `createSql` and a query runs itself:

```ts
const sql = createSql<DB>(pool);
const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();
```

| Method | Returns | Error |
|---|---|---|
| `q.execute()` | `Promise<Row[]>` | — |
| `q.executeTakeFirst()` | `Promise<Row \| undefined>` | — |
| `q.executeTakeFirstOrThrow()` | `Promise<Row>` | `NoResultError` (carries `text`) on 0 rows |
| `q.executeCount()` | `Promise<number>` (row count) | rejects if the executor reports no count |

`executeCount()` returns the count Postgres reports for the statement: rows affected by
`INSERT`, `UPDATE`, `DELETE` or `MERGE`, with or without `RETURNING`, rows returned by `SELECT`,
and 0 for DDL. Every adapter reports it: `rowCount` (`pg`), `count` (postgres.js),
`numAffectedRows` or the number of rows (Kysely), `$executeRawUnsafe` (Prisma), and for Drizzle
the count of the driver underneath.

`createSql(client, { rowKeys: "camelCase" })` gives camelCase rows, in the types and from
`execute*` alike. See [camelCase row keys](./queries#camelcase-row-keys).

The `Row` type flows from `Query<Row, Params>`, so core's `RowType<Q>` names it for your own
helpers.

## Transactions

`sql.transaction(fn)` runs `fn` with `tx`, the same `sql` bound to one transaction. It commits
when `fn` resolves and rolls back when it throws (the error is rethrown); it resolves to `fn`'s
result. `tx.transaction(fn)` nests with a savepoint:

<<< @/snippets/adapters.ts#transaction

| Adapter | `sql.transaction(fn)` | `tx.transaction(fn)` |
|---|---|---|
| `@typesql/pg` | on a `Pool`: checks out a client, `BEGIN`…`COMMIT` on it, releases it; on a `Client` or `PoolClient`: `BEGIN`…`COMMIT` on it | `SAVEPOINT` |
| `@typesql/postgres` | `sql.begin(fn)` | `tx.savepoint(fn)` |
| `@typesql/kysely` | `db.transaction().execute(fn)` | `SAVEPOINT` on the transaction |
| `@typesql/prisma` | `prisma.$transaction(fn)` (interactive) | `SAVEPOINT` on the transaction client |
| `@typesql/drizzle` | `db.transaction(fn)` | Drizzle's nested `tx.transaction(fn)` (a savepoint) |

A `sql` bound to a client that is already in a transaction (a postgres.js `TransactionSql`, a
Kysely `Transaction`, a Prisma transaction client, a Drizzle `tx`) also uses a savepoint.
Statements inside one transaction share one connection, so run them one after another, not
with `Promise.all`.

### Running on another client

Each `execute*` method also takes an executor, which wins over the bound one: `executor(client)`
from the adapter wraps any client `createSql` accepts. Or bind a `sql` to that client:

<<< @/snippets/adapters.ts#execute-per-call

A `sql` from `createSql<DB>()` without a client builds queries (for types, tests or another
runner); their `execute*` methods reject unless an executor is passed, and `sql.transaction`
rejects.

### Writing an executor

An `Executor` is `(text, values) => PromiseLike<Row[] | { rows, rowCount }>`. Return the
rows alone when you have no count: everything except `executeCount` works, unless the executor
also has a `count(text, values)` method, which `executeCount` then calls. `rowCount: null`
means the statement has no count, which `executeCount` reads as 0. A wrapper around an
adapter's executor can return its result unchanged:

<<< @/snippets/adapters.ts#custom-executor

### Executors that transform rows

The row types describe what the driver returns for the SQL: the column names Postgres gives
and the type map's value types. `execute*` hands back the rows the executor returns, unchanged
(apart from `rowKeys`). An executor that reshapes rows, such as one that keeps Kysely plugins
or post-processes values, makes the types wrong. Pick the narrowest fix:

1. **camelCase keys**: use `rowKeys: "camelCase"` and keep the executor plain. With Kysely,
   use `@typesql/kysely`'s `createSql(db, { rowKeys: "camelCase" })` or `executor(db)`, which
   bypass plugins, instead of an executor that runs `CamelCasePlugin`.
2. **Different value types** from your driver's parsers (say `timestamptz` parsed to a string):
   use a [type map](./schema#type-maps) that says so: `createSql<DB, MyTypeMap>(executor)`.
3. **Anything else**: keep the executor plain and transform in a typed helper built on
   `RowType<Q>`:

<<< @/snippets/adapters.ts#transform-helper

Augmenting `Query` also works, and changes the return type of `execute*` for every query in the
program:

```ts
declare module "@typesql/core" {
  interface Query<Row, Params extends readonly unknown[] = readonly unknown[], Text extends string = string> {
    execute(executor?: Executor): Promise<Wire<Row>[]>;
    executeTakeFirst(executor?: Executor): Promise<Wire<Row> | undefined>;
    executeTakeFirstOrThrow(executor?: Executor): Promise<Wire<Row>>;
  }
}
```

It is global and easy to get wrong. The type parameters must repeat core's exactly (names,
constraints and defaults). The new signatures only win because TypeScript puts overloads from a
later declaration first. `RowType<Q>` still describes the untransformed row. Prefer the options
above. If you do augment, make sure the executor's transform and the declared type match.

## `@typesql/pg` (node-postgres 8.x)

<<< @/snippets/adapters.ts#pg

- `PgQueryable` is anything with `query(text, values?) → Promise<{ rows, rowCount }>`:
  `Pool`, `Client` and `PoolClient` all satisfy it.
- `sql.transaction(fn)` on a `Pool` checks out a client, runs `BEGIN`, `fn(tx)`, `COMMIT`, and
  `ROLLBACK` + rethrow on error. If the `ROLLBACK` itself fails the client is released with the
  error so the pool discards the connection. On a `Client` or `PoolClient` it runs on that
  connection and leaves releasing it to you. Other queryables are rejected, since `BEGIN` and
  `COMMIT` must reach one connection.
- `executeCount` returns `rowCount ?? 0` (`rowCount` is `null` for statements without a count).
- `values` are copied into a mutable array before being handed to `pg`.

### `PgTypeMap`

Verified against `pg-types@2.2.0/lib/textParsers.js` (what `pg` 8.x uses by default):

| Postgres | TS | Why |
|---|---|---|
| `int2`, `int4`, `oid`, `float4`, `float8` | `number` | `parseInt`/`parseFloat` |
| `int8` | `string` | `parseBigInteger` keeps the digits as a string (so `count(*)`, `sum(int4)`) |
| `numeric`, `money` | `string` | no parser registered |
| `bool` | `boolean` | |
| `date`, `timestamp`, `timestamptz` | `Date` | `postgres-date`; `'infinity'` becomes the number `Infinity` |
| `json`, `jsonb` | `unknown` | `JSON.parse` |
| `bytea` | `Buffer` | `postgres-bytea` |
| `interval` | `PgInterval` | `postgres-interval` object: optional `years…milliseconds`, `toPostgres()`, `toISO()` |
| `point` / `circle` | `{ x, y }` / `{ x, y, radius }` | |
| `text`, `varchar`, `bpchar`, `name`, `uuid`, `time`, `timetz`, `inet`, `cidr`, `macaddr`, `xml`, `bit`, `varbit`, `tsvector`, `tsquery`, all range types, `regclass`… | `string` | raw text |
| `record`, `void` | `string` | raw text (`"(1,foo)"`, `""`) |

Arrays are mapped element-wise by core (`T[]` → `TsTypeOf<T>[]`), which is right for every
array type `pg-types` registers (bool, bytea, int2, int4, int8, oid, float4, float8, point,
bpchar, varchar, text, macaddr, inet, cidr, date, timestamp, timestamptz, interval, json,
jsonb, uuid, money, time, timetz, numrange). Two mismatches cannot be expressed in the map
(core's `TsTypeOf` looks at the `[]` suffix before consulting the map):

- `numeric[]` is parsed with `parseFloat` → `number[]` at runtime, typed `string[]`;
- array types without a registered parser come back as the raw `{…}` **string**: `name[]`,
  `"char"[]`, `xml[]`, `bit[]`, `varbit[]`, `tsvector[]`, `tsquery[]`, `circle[]`, `line[]`,
  `lseg[]`, `box[]`, `path[]`, `polygon[]`, `int4range[]`, `int8range[]`, `tsrange[]`,
  `tstzrange[]`, `daterange[]`, `macaddr8[]`, `regclass[]`, `record[]`. `PgTypeMap` declares
  the two that [`PgCatalog`](./schema#system-catalogs) columns use, `aclitem[]` and
  `"char"[]`, as `string`.

If you depend on one of these, register a parser with `pg.types.setTypeParser` and use a
custom type map (`createSql<DB, MyMap>()` from core), or cast in SQL.

Parameters accept the row type plus `PgParamTypeMap` (`PgTypeMap["$params"]`), verified against
`prepareValue` in `pg/lib/utils.js`: `pg` sends a `Date` as a timestamp with the local offset,
a `Buffer` or typed array as bytea, an object with `toPostgres()` (such as `PgInterval`)
through it, and anything else with `toString()`.

| Postgres | Parameters also accept |
|---|---|
| `int8`, `numeric`, `money` | `number \| bigint \| string` |
| `date`, `timestamp`, `timestamptz` | `Date \| string` |
| `interval` | `string` |
| `bytea` | `Uint8Array` |

Plain objects are sent as `JSON.stringify` output and arrays as Postgres array literals, so
they are not accepted for other types.

## `@typesql/postgres` (postgres.js 3.x)

<<< @/snippets/adapters.ts#postgresjs

- `PostgresJsQueryable` is anything with `unsafe(query, parameters?)`: the `Sql` instance,
  the `TransactionSql` passed by `begin`, and `ReservedSql` all satisfy it. Queries run with
  `sql.unsafe(text, values)`, so the text goes to the server untouched.
- `execute` returns a plain `Row[]` (postgres.js' result metadata — `count`, `command`,
  `columns` — is stripped by `Array.from`). `executeCount` returns the result's `.count` (0
  when postgres.js reports `null`, as for DDL).
- `sql.transaction(fn)` is `sql.begin(fn)`: postgres.js issues `BEGIN`, runs `fn(tx)`,
  `COMMIT`, or `ROLLBACK` and rethrows. On a `TransactionSql` it is `savepoint(fn)`.

### `PostgresJsTypeMap` and `PostgresJsBigIntTypeMap`

Verified against `postgres@3.4.9/src/types.js`. The default parsers are only:

| OIDs | Postgres | TS |
|---|---|---|
| 21, 23, 26, 700, 701 | `int2`, `int4`, `oid`, `float4`, `float8` | `number` |
| 16 | `bool` | `boolean` |
| 1082, 1114, 1184 | `date`, `timestamp`, `timestamptz` | `Date` (`new Date(x)`) |
| 114, 3802 | `json`, `jsonb` | `unknown` (`JSON.parse`) |
| 17 | `bytea` | `Buffer` |

Everything else is the text Postgres sent, i.e. `string`: notably `int8`, `numeric`,
`interval`, `point`, `circle`, `record`, `void`. With
`postgres({ types: { bigint: postgres.BigInt } })` int8 (OID 20) is parsed to `bigint`;
use `PostgresJsBigIntTypeMap` / `createBigIntSql` for those connections (`int8[]` becomes
`bigint[]`).

Arrays: postgres.js fetches `pg_type` on connect (`fetch_types: true`, the default) and
registers an element-wise parser for every array type, so core's `T[]` mapping is exact.

Parameters accept the row type plus `PostgresJsParamTypeMap` (`PostgresJsTypeMap["$params"]`).
postgres.js serializes each value with the serializer of the parameter type the server
reports (`Bind` in `src/connection.js`), and with `'' + x` for types without one:

| Postgres | Parameters also accept |
|---|---|
| `int8`, `numeric`, `money` | `number \| bigint \| string` |
| `date`, `timestamp`, `timestamptz` | `Date \| string \| number`: sent as `new Date(x).toISOString()`, so a string must be one JS `Date` can parse and a number is epoch milliseconds |
| `interval` | `string` |
| `bytea` | `Uint8Array` |

`bool` parameters take only booleans: the serializer sends `'f'` for anything but `true`.

#### Dates

`date` is not a string under postgres.js: `types.date.from` is
`[1082, 1114, 1184]`, so `date`, `timestamp` and `timestamptz` are all `Date` by default, the
same as `pg`. The remaining difference is how the text is parsed: postgres.js does
`new Date("1815-12-10")`, which is UTC midnight, whereas `pg`'s `postgres-date` yields local
midnight for a `date`. Both maps say `Date`.

## Migrations

Both adapters export `migrate(db, m)`, which runs `m.statements` in order inside one
transaction (all or nothing). `m` is anything with `statements: readonly string[]`; the
`migrations()` builder from `@typesql/core` fits, and its `schema` type is what you pass to
`createSql`:

```ts
import { migrations, type SchemaOf } from "@typesql/core";
import { createSql, migrate } from "@typesql/pg";       // or "@typesql/postgres"

const m = migrations()
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN display_name text");

await migrate(pool, m);                                // pg: one pooled client, BEGIN … COMMIT
const sql = createSql<SchemaOf<typeof m>>(pool);
```

Statements are sent without parameters (simple query protocol), so `$$`-quoted function
bodies and multi-statement scripts work. `migrate` does not track which migrations have
already run; keep a `schema_migrations` table or use a dedicated tool for that and use
`migrations()` for the types.

## Driver differences at a glance

| Postgres type | `pg` default | postgres.js default | postgres.js + `BigInt` |
|---|---|---|---|
| `int8` (`count(*)`, `bigserial`) | `string` | `string` | `bigint` |
| `numeric` | `string` | `string` | `string` |
| `date`, `timestamp`, `timestamptz` | `Date` | `Date` | `Date` |
| `interval` | `PgInterval` object | `string` | `string` |
| `point`, `circle` | object | `string` | `string` |
| `bytea` | `Buffer` | `Buffer` | `Buffer` |
| `json`, `jsonb` | parsed (`unknown`) | parsed | parsed |
| `numeric[]` | `number[]` (typed `string[]`) | `string[]` | `string[]` |
| unparsed array types | raw string | element-wise array | element-wise array |
