# node-postgres

`@typesql/pg` runs queries on node-postgres 8.x and types rows with `PgTypeMap`.

```sh
pnpm add @typesql/core @typesql/pg pg
```

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

See the [overview](./#running-queries) for the `execute*` methods, transactions and executors
that every adapter shares.

## `PgTypeMap`

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
  the two that [`PgCatalog`](../guide/schema#system-catalogs) columns use, `aclitem[]` and
  `"char"[]`, as `string`.

If you depend on one of these, register a parser with `pg.types.setTypeParser` and use a
custom type map (`createSql<DB, MyMap>()` from core), or cast in SQL.

### Parameters

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

## Migrations

`migrate(db, m)` runs `m.statements` in order inside one transaction (all or nothing), on one
pooled client when `db` is a `Pool`. `m` is anything with `statements: readonly string[]`; the
`migrations()` builder from `@typesql/core` fits, and its `schema` type is what you pass to
`createSql`:

```ts
import { migrations, type SchemaOf } from "@typesql/core";
import { createSql, migrate } from "@typesql/pg";

const m = migrations()
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN display_name text");

await migrate(pool, m);
const sql = createSql<SchemaOf<typeof m>>(pool);
```

Statements are sent without parameters (simple query protocol), so `$$`-quoted function
bodies and multi-statement scripts work. `migrate` does not track which migrations have
already run; keep a `schema_migrations` table or use a dedicated tool for that and use
`migrations()` for the types. See [Migrations](../guide/migrations).
