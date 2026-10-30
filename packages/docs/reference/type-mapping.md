# Type mapping

Your schema uses the database's type names (in PostgreSQL, `int8`, `timestamptz`). A **type map** says which TypeScript type each one becomes. This page lists the maps for each driver, what parameters accept, and how to write your own map.

Each adapter's `createSql` picks the map that matches its driver. `createSql` from `@typesql/core` with the `postgres` dialect uses `DefaultTypeMap`, which matches node-postgres.

## At a glance

The common types under each driver's default parsers:

| Postgres type | `@typesql/pg` | `@typesql/postgres` | `@typesql/postgres` (`{ bigint: true }`) |
|---|---|---|---|
| `int2`, `int4`, `float4`, `float8` | `number` | `number` | `number` |
| `int8` (`count(*)`, `bigserial`) | `string` | `string` | `bigint` |
| `numeric` | `string` | `string` | `string` |
| `text`, `varchar`, `uuid` | `string` | `string` | `string` |
| `bool` | `boolean` | `boolean` | `boolean` |
| `date`, `timestamp`, `timestamptz` | `Date` | `Date` | `Date` |
| `interval` | `PgInterval` object | `string` | `string` |
| `point`, `circle` | object | `string` | `string` |
| `bytea` | `Buffer` | `Buffer` | `Buffer` |
| `json`, `jsonb` | `unknown` (typed when its shape is known) | `unknown` | `unknown` |
| `T[]` | element type `[]` | element type `[]` | element type `[]` |
| `numeric[]` | `number[]` at runtime, typed `string[]` | `string[]` | `string[]` |
| array types without a parser | raw `{…}` string | element-wise array | element-wise array |

`int8` and `numeric` are strings under node-postgres because a JavaScript number cannot hold every value.

Kysely and Drizzle run on one of these two drivers. With Kysely's `PostgresDialect` (node-postgres), pass `PgTypeMap` for the exact `pg` types. With `drizzle-orm/postgres-js`, pass `PostgresJsTypeMap` (`interval` is a string there); `@typesql/drizzle` parses dates back to `Date` on that driver. See [From Kysely, Drizzle or Prisma](../guide/orms).

A `json` / `jsonb` value with a known shape ([`Json<T>` columns](../guide/schema#typed-json-columns), JSON built in SQL) is typed from that shape, unless the map reads the type as a `string`.

## node-postgres

`PgTypeMap`, the map of `@typesql/pg`. Verified against `pg-types@2.2.0/lib/textParsers.js`, which `pg` 8.x uses by default:

| Postgres | TypeScript | Why |
|---|---|---|
| `int2`, `int4`, `oid`, `float4`, `float8` | `number` | `parseInt` / `parseFloat` |
| `int8` | `string` | `parseBigInteger` keeps the digits as a string (so `count(*)`, `sum(int4)`) |
| `numeric`, `money` | `string` | no parser registered |
| `bool` | `boolean` | |
| `date`, `timestamp`, `timestamptz` | `Date` | `postgres-date`; `'infinity'` becomes the number `Infinity` |
| `json`, `jsonb` | `unknown` | `JSON.parse` |
| `bytea` | `Buffer` | `postgres-bytea` |
| `interval` | `PgInterval` | `postgres-interval` object: optional `years…milliseconds`, `toPostgres()`, `toISO()` |
| `point` / `circle` | `{ x, y }` / `{ x, y, radius }` | |
| `text`, `varchar`, `bpchar`, `name`, `uuid`, `time`, `timetz`, `inet`, `cidr`, `macaddr`, `xml`, `bit`, `varbit`, `tsvector`, `tsquery`, all range types, `regclass`, … | `string` | raw text |
| `record`, `void` | `string` | raw text (`"(1,foo)"`, `""`) |

### Arrays

Arrays are mapped element by element (`T[]` becomes the element's type `[]`), which is right for every array type `pg-types` registers. Two cases differ at runtime, and the map can't express them (the `[]` suffix is handled before the map is read):

- `numeric[]` is parsed with `parseFloat`, so it is `number[]` at runtime but typed `string[]`.
- Array types without a registered parser come back as the raw `{…}` string: `name[]`, `"char"[]`, `xml[]`, `bit[]`, `varbit[]`, `tsvector[]`, `tsquery[]`, `circle[]`, `line[]`, `lseg[]`, `box[]`, `path[]`, `polygon[]`, `int4range[]`, `int8range[]`, `tsrange[]`, `tstzrange[]`, `daterange[]`, `macaddr8[]`, `regclass[]`, `record[]`.

Arrays of user-defined and extension types (enums, domains, `citext`) have no parser in `pg-types` either. `@typesql/pg`, and `@typesql/drizzle` on node-postgres, parse them: the first time a result has such a column, they look up in `pg_type` which of its types are arrays (once per pool or client), then parse the `{…}` text with the element's base type (numbers for `int2`/`int4`/`oid`/`float4`/`float8` domains, booleans for `bool`, strings otherwise). Kysely and Prisma on node-postgres don't expose the result's column types, so there these arrays stay raw `{…}` strings, although they are typed as arrays; cast them in SQL (`moods::text[]`) to get an array.

`PgTypeMap` declares the two that [`PgCatalog`](../guide/schema#system-catalogs) columns use, `aclitem[]` and `"char"[]`, as `string`.

If you depend on one of these, register a parser with `pg.types.setTypeParser` and use a [custom type map](#custom-type-maps), or cast in SQL.

### Parameters

`PgParamTypeMap` lists what parameters accept besides the row type ([table](#parameter-types)). It follows `prepareValue` in `pg/lib/utils.js`: `pg` sends a `Date` as a timestamp with the local offset, a `Buffer` or typed array as bytea, an object with `toPostgres()` (such as `PgInterval`) through that method, and anything else with `toString()`. Plain objects are sent as `JSON.stringify` output and arrays as Postgres array literals, so they aren't accepted for other types.

## postgres.js

`PostgresJsTypeMap`, the map of `@typesql/postgres`. Verified against `postgres@3.4.9` and `postgres@4.0.0` (`src/types.js`). The default parsers are only these:

| OIDs | Postgres | TypeScript |
|---|---|---|
| 21, 23, 26, 700, 701 | `int2`, `int4`, `oid`, `float4`, `float8` | `number` |
| 16 | `bool` | `boolean` |
| 1082, 1114, 1184 | `date`, `timestamp`, `timestamptz` | `Date` (`new Date(x)`) |
| 114, 3802 | `json`, `jsonb` | `unknown` (`JSON.parse`) |
| 17 | `bytea` | `Buffer` |

Everything else is the text Postgres sent, so `string`: notably `int8`, `numeric`, `interval`, `point`, `circle`, `record` and `void`.

### bigint connections

With `postgres({ types: { bigint: postgres.BigInt } })`, `int8` (OID 20) is parsed to `bigint`. Use `PostgresJsBigIntTypeMap`, or `createSql(sql, { bigint: true })`, for those connections. `int8[]` then becomes `bigint[]`.

### Arrays

postgres.js fetches `pg_type` on connect (`fetch_types: true`, the default) and registers an element-wise parser for every array type. So the element-by-element mapping is exact.

### Parameters

`PostgresJsParamTypeMap` lists what parameters accept besides the row type ([table](#parameter-types)). postgres.js serializes each value with the serializer of the parameter type the server reports (`Bind` in `src/connection.js`), and with `'' + x` for types without one.

- Dates are sent as ISO strings, so a string must be one JS `Date` can parse. Epoch-millisecond numbers work on postgres.js 3 but fail on 4 (`22008 date/time field value out of range`), so `PostgresJsParamTypeMap` accepts only `Date` and `string`.
- `bool` parameters take only booleans: the serializer sends `'f'` for anything but `true`.

### Dates

`date`, `timestamp` and `timestamptz` are all `Date` by default (`types.date.from` is `[1082, 1114, 1184]`), the same as under `pg`. Only the parsing differs: postgres.js runs `new Date("1815-12-10")`, which is UTC midnight, while `pg`'s `postgres-date` gives local midnight for a `date`. Both maps say `Date`.

postgres.js 3 and 4 differ in two more places:

- A `timestamp` (without time zone) is local time on 3 and UTC on 4.
- `'infinity'` and `'-infinity'` are an `Invalid Date` on 3 and the numbers `Infinity` and `-Infinity` on 4, although the map says `Date`. Cast them in SQL, or filter them out, if your data has them.

## Prisma

`PrismaTypeMap`, the map of `@typesql/prisma`. It describes what `$queryRaw` returns:

| Postgres | TypeScript |
|---|---|
| `int2`, `int4`, `float4`, `float8` | `number` |
| `int8` (so `count(*)`), `oid` | `bigint` |
| `numeric`, `money` | `Decimal` |
| `date`, `timestamp`, `timestamptz`, `time`, `timetz` | `Date` |
| `bytea` | `Uint8Array` |
| `json`, `jsonb` | `JsonValue` |
| text-like types, enums | `string` (enums: their values) |

Prisma throws "Unsupported column type" for other types (`interval`, geometric types, ranges). They are `unknown` here, so cast them in SQL (`duration::text`).

## SQLite

`DefaultTypeMap` of `@typesql/core/sqlite`, used by `@typesql/sqlite` and by `createSql(sqlite)`. node:sqlite, better-sqlite3 and bun:sqlite return the same JavaScript values (better-sqlite3 returns blobs as `Buffer`, a subclass of `Uint8Array`):

| SQLite type | TypeScript |
|---|---|
| integer affinity (`integer`, `int`, `bigint`, …) | `number` |
| `real`, `float`, `double` | `number` |
| numeric affinity (`numeric`, `decimal`, `boolean`, …) | `number` |
| text affinity (`text`, `varchar`, `clob`, …) | `string` |
| `date`, `datetime`, `time`, `timestamp`, `json`, `uuid` | `string` |
| `blob` | `Uint8Array` |
| no type, `any` | `unknown` |

A type name is looked up in the map first, then its [affinity](../guide/sqlite#types) (`integer`, `real`, `numeric`, `text`, `blob` or `any`). `BigIntTypeMap` reads integers as `bigint`, for `createSql(db, { bigint: true })`.

Parameters accept the map's type and, through `DefaultParamTypeMap`, `bigint` for integer, real and numeric columns. A parameter without a type accepts `string | number | bigint | Uint8Array | null`.

### Prisma on SQLite

`PrismaSqliteTypeMap`, the map of `@typesql/prisma` with `sqlite`. It describes what `$queryRaw` returns through Prisma's SQLite adapters, which convert by declared column type:

| SQLite type | TypeScript |
|---|---|
| `integer`, `int`, `real`, `numeric` | `number` |
| `bigint`, `int8` | `bigint` |
| `decimal` | `Decimal` |
| `boolean` | `boolean` |
| `datetime`, `timestamp`, `date`, `time` | `Date` |
| `jsonb` (Prisma's `Json`) | `JsonValue` |
| `text`, `json` | `string` |
| `blob` | `Uint8Array` |

Parameters also accept `number` for `bigint`, `number | string` for `decimal`, `number` for `boolean`, and `string` for the date types.

## Parameter types

A parameter accepts its type's row type, plus the entry for that type in the map's `$params` key: what the driver can serialize for it. A map without `$params` gets `DefaultParamTypeMap`.

| Postgres type | Also accepted (`DefaultParamTypeMap`, `PgParamTypeMap`) | `PostgresJsParamTypeMap` |
|---|---|---|
| `int8`, `numeric`, `money` | `number \| bigint \| string` | the same |
| `date`, `timestamp`, `timestamptz` | `Date \| string` | the same |
| `interval` | `string` | the same |
| `bytea` | `Uint8Array` | the same |

Array elements also accept `null`.

So a map that types rows with a custom parser keeps the driver's input types. With `timestamptz: string` (a parser that formats timestamps), parameters still accept a `Date`. `ParamTypeMapOf<TM>` is the input map in effect, and `TsParamTypeOf<TM, DB, T>` is what a parameter of type `T` accepts.

To change what parameters accept, set `$params`. It replaces the default, so extend `DefaultParamTypeMap` (or the adapter's map) to keep the rest:

```ts
import type { DefaultParamTypeMap } from "@typesql/core/postgres";

declare class Instant {
	toPostgres(): string;
}
interface AppParams extends Omit<DefaultParamTypeMap, "timestamptz"> {
	timestamptz: Date | string | Instant;
}
interface AppMap extends Omit<DefaultTypeMap, "timestamptz"> {
	timestamptz: string;
	$params: AppParams;
}
const app = createSql<DB, AppMap>(postgres);
const recent = app(
	"SELECT id, created_at FROM users WHERE created_at > $1",
	new Date(),
);
```

## Custom type maps

A type map is any object type from Postgres type names to TypeScript types. Pass it as the second type argument of an adapter's `createSql`, or the third of core's:

```ts
import { createSql } from "@typesql/core";
import { type DefaultTypeMap, postgres } from "@typesql/core/postgres";

interface MyMap extends Omit<DefaultTypeMap, "int8"> {
	int8: number;
	"int8[]": number[];
}
const sql = createSql<DB, MyMap>(postgres);
const counts = sql(
	"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id",
);
```

A type is resolved in this order:

1. An exact entry in the map. So a map may define `"numeric[]": number[]`.
2. For `T[]`, the element type, mapped the same way, then `[]`.
3. `DB["$types"]` (your enums and other named types).
4. Otherwise `unknown`.

Nullable columns add `| null`.

Use a custom map when you register your own parsers with the driver (for example `pg.types.setTypeParser`), so the types match what the driver returns.
