# Schema and type maps

## Declaring tables

A schema is an interface whose keys are tables. Each column is declared with a helper:

| Helper | Meaning |
|---|---|
| `Col<"text">` | `NOT NULL`, no default |
| `Nullable<"text">` | `NULL` allowed |
| `Generated<"int4">` | has a default (serial, identity, `DEFAULT …`): optional in `INSERT` |
| `NullableGenerated<"text">` | both |
| `Arr<"int4">` | an array column, `int4[]` (same as `Col<"int4[]">`) |
| `Enum<"mood">` | a column of a user enum type, values listed under `$types` |
| `View<{ … }>` | a view: readable like a table, rejected as an `INSERT`/`UPDATE`/`DELETE` target |

<<< @/snippets/schema.ts#schema

Type names are Postgres names. Common spellings are normalized, so `integer`, `int` and `int4`
are the same, as are `bigint`/`int8`, `boolean`/`bool`, `character varying`/`varchar`,
`double precision`/`float8` and `timestamp with time zone`/`timestamptz`. A name typesql does
not know (an extension type or a domain) is kept as is and maps to `unknown` unless the type
map or `$types` says otherwise.

## Enums

List enum values under `$types`; a column declared with `Enum<"mood">` then has the type
`"happy" | "neutral" | "sad"`, both in rows and as a parameter.

<<< @/snippets/queries.ts#enum

## Other schemas

Tables in a Postgres schema other than `public` go in a nested object:

```ts
interface DB {
  users: { … };                         // public.users, or just users
  auth: { sessions: { token: Col<"uuid">; user_id: Col<"int4"> } }; // auth.sessions
}
```

## Type maps

The schema says what Postgres returns; the **type map** says what the driver turns it into.
`int8` and `numeric`, for example, are strings under node-postgres because a JavaScript number
cannot hold every value. Pick the map that matches your driver by importing `createSql` from
its adapter:

| Postgres type | `@typesql/pg` | `@typesql/postgres` | `@typesql/postgres` (`createBigIntSql`) |
|---|---|---|---|
| `int2`, `int4`, `float4`, `float8` | `number` | `number` | `number` |
| `int8` (also `count(*)`) | `string` | `string` | `bigint` |
| `numeric` | `string` | `string` | `string` |
| `text`, `varchar`, `uuid` | `string` | `string` | `string` |
| `bool` | `boolean` | `boolean` | `boolean` |
| `date`, `timestamp`, `timestamptz` | `Date` | `Date` | `Date` |
| `json`, `jsonb` | `unknown` | `unknown` | `unknown` |
| `bytea` | `Buffer` | `Buffer` | `Buffer` |
| `T[]` | element type `[]` | element type `[]` | element type `[]` |

`createSql` from `typesql` itself uses `DefaultTypeMap`, which matches node-postgres. A custom
map is any object type from Postgres type names to TypeScript types:

<<< @/snippets/type-maps.ts#custom

The full mapping for each driver, including intervals, geometric types and arrays, is on the
[Adapters](./adapters) page.
