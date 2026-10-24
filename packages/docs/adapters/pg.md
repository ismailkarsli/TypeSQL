# node-postgres

`@typesql/pg` runs queries on node-postgres 8.x and types rows with `PgTypeMap`.

```sh
pnpm add @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagHYD2AJrALTSEDOWA5gE6xWgAUAAljEwI4A2w0WgEoAdKEQBXWPQxNQ9CflCElkQhPqgACoUK8ANKACG+YvMJpmRxqE5wzAI0jocRrACgQoQQHJmpADMjCV4sb2sqaWZGLA18AC5QDHwsAA5jUwIJAFtpDABjY2YaGXxaKkMsDFyaI2zoK2YAETdYMQAJQgA3aVscWHkmEKwqEXd3asp6MLsBgG9QAGE9QwBxWHxpVuJDADkQ3iMHXgGAX1AA+kJs0AAiDi4qPmB8wkZbgG4J+rewhfzGK14HxQOdLtc7g84E9+IJPt8pn9tLpeKCLlcbrc4V9PGAAOoyLADXAYZhOUCuUyGN6gWgbLZEpJhcE3NQaUDENxHIyRRIAA1mMKSKSuVDg+TCZDIGlRgDICUBS9RhKj5frZIwiEZ8iYpaRBfIDJoAIVAc3cAEgJJF6FREmbzeaMMREutNvRtgAeW7JLAAFluAD4vg7YOqMLxEsteF6iQAPLCB4Pm4ik6CHSAAfXwdVgiX2vEOx1gMdg8cTFvNDiMh3wBsjei9+ByeXy5YdANg2wzbhd9PdROIMeqTCwdWgWAAXm3TsHKDRbaaK07e27Pd6Uqk2+bgrg3hnl0sG+u-VuqlgTvXo7c4wmgxXoBJjqT+sRu1g8wcjichzVR-VJ9OXynOMrz4DQ3goqAAC8BCwGgyJ6Cw-wqJsEoYCo8BYKUtCJFi1B0IwtogLwhD5NWOD4cARjQNAtygkIXygeBQowR2QJ8B6xoBiwlB6AxIEqOBTgAIISLumgwTCLAWny8AAKLIHJizgN4IhOoY0CatgJwaSID5PlQL5voYEgiKGRjhu4oDWTZtl2fZoAAGIAEoAPIALIQfO3igAAUq5ACSuygFaUQhaArnBaZTrQapO4UfQ+7EFZDmpfZeLtHJzlyXFYkJUlsUACQAIx8voFoAOzlfxTFhHOIyxUYaAWWEIl5W8ZmxrA+RibALD8V4NkAHoAPwCWBYShRJxjNdgoBSTJ8mKcpSQ7KAVY1gahhsQOb5OW5nlTcwGVZTl5nhkVpXleatxGJybClmOJwiK82S3NVnXdb14BGAA1rAjkYDaWCufQ4A4FcaD9V8g3WaN43ga8igNTBTUtfNfDSeaskKUpKnxXu6mgEjKQsAAVEIoDCfABD7R5XkNasbkAKpaKARoAJrGO1iVOmV7iiKWX1EtDuK2fDYtYLGSTFCCDjqJkWCEMomy2O6YFGGhKiRh57kBSpaD9EouADAEiha0ohF6D0FSgG5yDIEawmLAA0i4GxMn0kOjO4tUMwFZio7Nyp8Jq6tUJrVQqCwPKQLWrBS5TUEBou5qDfD5p+wsMXnEH6NS1j2NBfJzkqUF4CuSF1rMCw50GOt1YmAalMAGrCcgzNyTTLAlYYhUAEyU9l4DM85uxBasq38w6twMJrsAPbGT1tK970VgADNdgtdT1RI-f9gPA6D4OQ6LmeCXV+GNcHtixoXfLF1lZe7BXDM1wTvNrWeJyt+3nfd73UAA8h5yRHmPCeU9rqOh2BWW47RYAFkIGvc029hawH3gDIGNBj4QwsGfGIcQGZqWIEBfiYstDWBzESG0xgbCqm6v9MwRhaAWQmn0WAQNiZ6ByAkbm4kCqkmFH6MYaM5pST5E0XG4AcouXpvVY6mVsp8PyjFGCJUyp3AqrcVBu8+oMVAF4aQVx6CJCMPNLCyRaAywIIQMIJghG+ncEAA) <!-- playground:pg --> to hover the types and edit the SQL, with nothing to install.

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
