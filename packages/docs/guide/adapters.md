# Adapters

`@typesql/core` is type-only: `sql("SELECT …", …params)` returns `{ text, values }` plus phantom
`Row`/`Params` types. An adapter adds three things for one driver:

1. a **type map** (`PgTypeMap`, `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap`) describing how
   that driver's *default* parsers turn each Postgres type into a JS value;
2. a pre-bound `createSql<DB>()` that uses that map;
3. small helpers that run a `Query` on the driver and return rows typed from it:
   `query`, `one`, `maybeOne`, `many`, `execute`, `transaction`.

The helper surface is identical in both packages:

| Helper | Returns | Error |
|---|---|---|
| `query(client, q)` | `Promise<Row[]>` | — |
| `one(client, q)` | `Promise<Row>` | `RowCountError` (`code: "NO_ROWS" \| "TOO_MANY_ROWS"`) unless exactly 1 row |
| `maybeOne(client, q)` | `Promise<Row \| null>` | `RowCountError("TOO_MANY_ROWS")` on more than 1 row |
| `many(client, q)` | `Promise<[Row, ...Row[]]>` | `RowCountError("NO_ROWS")` on 0 rows |
| `execute(client, q)` | `Promise<number>` (affected rows) | — ; for DML without `RETURNING`, whose `Row` is `never` |
| `transaction(pool, fn)` | `Promise<T>` from `fn` | rethrows after ROLLBACK |

`RowCountError` carries `code`, `expected` (`"exactly 1"`, `"at most 1"`, `"at least 1"`),
`actual` and the statement `text`. The `Row` type flows from `Query<Row, Params>` through
core's `RowType<Q>`, so the result of `sql(...)` can be passed straight in.

The client parameters are structural, so fakes work in tests without the driver.

### `q.execute()`

Pass the client to `createSql` and a query runs itself, Kysely-style:

<<< @/snippets/adapters.ts#execute

| Method | Returns | Error |
|---|---|---|
| `q.execute()` | `Promise<Row[]>` | — |
| `q.executeTakeFirst()` | `Promise<Row \| undefined>` | — |
| `q.executeTakeFirstOrThrow()` | `Promise<Row>` | `NoResultError` (carries `text`) on 0 rows |
| `q.executeCount()` | `Promise<number>` (row count) | rejects if the executor reports no count |

Each method also takes an executor, which wins over the bound one: `executor(client)` from the
adapter wraps any client the helpers accept, e.g. a transaction's. A query from a `createSql()`
without a client has no executor and rejects unless one is passed. `@typesql/kysely`,
`@typesql/prisma` and `@typesql/postgres` take their client the same way; `@typesql/drizzle`
takes an `executor(...)` from a driver adapter.

`executeCount()` returns the count Postgres reports for the statement: rows affected by
`INSERT`, `UPDATE`, `DELETE` or `MERGE`, with or without `RETURNING`, rows returned by `SELECT`,
and 0 for DDL. The `executor(...)` of `@typesql/pg` (`rowCount`), `@typesql/postgres` (`count`)
and `@typesql/kysely` (`numAffectedRows`, or the number of rows for other statements) report
it. Prisma's `$queryRawUnsafe` does not, so with `@typesql/prisma` use `executeRaw(prisma, q)`.

`createSql(client, { rowKeys: "camelCase" })` gives camelCase rows, in the types and from
`execute*` and the helpers alike. See [camelCase row keys](./queries#camelcase-row-keys).

`@typesql/kysely` and `@typesql/prisma` can also run queries through the ORM's own client
(`query`/`execute` on a `Kysely` instance, `queryRaw`/`executeRaw` on Prisma Client). See
[ORM schemas](./orm-schemas).

### Writing an executor

An `Executor` is `(text, values) => PromiseLike<Row[] | { rows, rowCount }>`. Return the
rows alone when you have no count: everything except `executeCount` works. `rowCount: null`
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
later declaration first. `RowType<Q>`, and with it the adapters' `query`/`one`/`many` helpers,
still describe the untransformed row. Prefer the options above. If you do augment, make sure
the executor's transform and the declared type match.
## `@typesql/pg` (node-postgres 8.x)

<<< @/snippets/adapters.ts#pg

- `PgQueryable` is anything with `query(text, values?) → Promise<{ rows, rowCount }>`:
  `Pool`, `Client` and `PoolClient` all satisfy it.
- `transaction(pool, fn)` needs `connect()` (a `Pool`): it checks out a client, runs `BEGIN`,
  `fn(client)`, `COMMIT`, and `ROLLBACK` + rethrow on error. If the `ROLLBACK` itself fails the
  client is released with the error so the pool discards the connection.
- `execute` returns `rowCount ?? 0` (`rowCount` is `null` for statements without a count).
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
  `tstzrange[]`, `daterange[]`, `macaddr8[]`, `regclass[]`, `record[]`.

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
  the `TransactionSql` passed by `begin`, and `ReservedSql` all satisfy it. Helpers call
  `sql.unsafe(text, values)` so the text goes to the server untouched.
- `query` returns a plain `Row[]` (postgres.js' result metadata — `count`, `command`,
  `columns` — is stripped by `Array.from`). `execute` returns the result's `.count` (0 when
  postgres.js reports `null`, as for DDL).
- `transaction(sql, fn)` is `sql.begin(fn)`: postgres.js issues `BEGIN`, runs `fn(tx)`,
  `COMMIT`, or `ROLLBACK` and rethrows.

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
const sql = createSql<SchemaOf<typeof m>>();
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
