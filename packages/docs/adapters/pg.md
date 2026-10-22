# node-postgres

`@typesql/pg` runs queries on node-postgres 8.x and types rows with `PgTypeMap`.

```sh
pnpm add @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagHYD2AJrALTSEDOWA5gE6xWgAUAAljEwI4A2w0WgEoAdKEQBXWPQxNQ9CflCElkQhPqgACoUK8ANKACG+YvMJpmRxqE5wzAI0jocRrACgQoQQHJmpADMjCV4sb2sqaWZGLA18AC5QDHwsAA5jUwIJAFtpDABjY2YaGXxaKkMsDFyaI2zoK2YAETdYMQAJQgA3aVscWHkmEKwqEXdqynowgG9tXV5QAF9QAPpCbNAAIkFNgG5x+sIp0Fn8xlb4PiWVtY3Nji4qPgFaPYPJsLsB2YBhPUMAOKwfDSVrEQwAORCvCMDl4A2Wq3WWwecCe-HyR1gb08YAA6jIsANcBhmE5QK5TIYjqBaMDQUSkmEkRs1BpQMQ3LCjJFEgADL7opIpNZUOD5MJkMgaBaAMgJQFL1GEqPl+tkjCIRnzxilpEF8gMmgAhE7uUCgCSRehURLTM3mpLERJAkH0MEAHk2ySwABZNgA+fYO0CwdUYXiJP68T1EgAeWADQYdxFJ0BhkAA+vg6rBElDeDC4bAY7B44n7eaHEYYfgDZG9J78Dk8vly8GzrAwRm3M76W6icQY9UmFg6tAsAAvNtLJOUGg203BjBO0AuhmwQdelKpafm4K4I4Z5f16Nb3272zYeEnktlwMV7wSOGk-rEbtYPPQ2Hwoc1Uf1Sdp0WfZFncdxMXwGhvHmUAAF4CFgNA5j0FhThUEEJQwFR4CwUpaESbZqDoRgbRAXhCHyascCI4AjGgaBNiWIR9ggqChXgjsLj4d1jX9FhKD0ZiwNYsInAAQQkA9NHg9EWD5eAAFFkAUn5wG8ERl0MaBNSvWAtJEaAn14F8N3fQwJBEUMjHDB9gzs+yHQAMQAJQAeQAWWg+dvFAAApVyAEkIQtK1mAkUBXOCizlzg9T92o+gj2IWyHNS808XaBTnIUuLJISpLYoAEgARj5QwAHYhJEryRliow0Gs0TIAkqTLNjWB8kk2AWCErwHQAPQAfmElQoMtXp4PqxrQFk+SlJUtTNNAKsawNQxOIHd9QBcjyQqiUAMqynKrPDIrSsMTYjE5NhSzHeERExbJNlEUsOq68AjAAa1gRyMGtLBXPocAcDWNAev2PrzSGkbILCTFFFqyaGuwGa+DkxTlNU4w8sPJb4ZSFgACohFAMT4AIba3M8udaoBNyAFUtFAI0AE1sakpK+Re9rOqJcHcWDaGBawWMkmKK4HHUTIsEIZQQVsN1IKMTCVEjDz3ICtS0H6JRcAGAJFBVpQSL0HoKlANzkGQI0xJ+ABpFxgSZPpQdGcDRrCGmArMJHpvRTVFaoZWqhUFgeUgWtWBFknYP9RdQD66HzWq2YYuWX2UZFuSgsU5y1KC8BXL261WBOgxlurEwDRJgA1MTkHphTyZYErDEKgAmEnsvAennIhIKAUdMqtgYZXYBu2M7raR7NkMAAGbm3qJD7vt+-7AeB0H+eTj2arq5HPljbOIVz-OIULmrmDDnHEqWqosHhWv68b5vW9ADuu4Unu+4HofDCWzY7RYAFkIM9NqS9YArx+n9GgG8QYWG3oMWI9AlA0w0sQECQkBZaGsDmIkJdrADFVB1b6ZgjC0GsrDPosA-qgExLwHICR2b5RiqSYUvoxhTRRrNJo81wA5R2tTIizBDrZWYbjH279zpbHKmA16vNurMQTmAaQax6CJCMDNXCyRaBiwIIQMIJh2E+ncEAA) <!-- playground:pg --> to hover the types and edit the SQL, with nothing to install.

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
