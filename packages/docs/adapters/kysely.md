# Kysely

`@typesql/kysely` converts the `DB` interface you give Kysely into a TypeSQL schema and runs
queries on your `Kysely` instance. The conversion happens only at the type level: there is no
code generation and no database connection.

```sh
pnpm add @typesql/core @typesql/kysely kysely
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagNKQDOsANpKABQACWMsRAjqcANbFmQCUAdKAJoB7AK4AnAh3KgAIgCFQGAHZZYogGYBDAMawq7EuQC0WwQBNYAc1iLQIrNGFZbogFAhQODYtOG0o7CqKXApEoLi6RFo4sAC2GgA0oF6moKIaaKBIqKLCiqGCNpAi4oQGFEpEWF46fAASggBuqmHRqQzCpFhEPC4YMdCCok4A3hJliQAKgpUWogzSGBqksFpYiXRwoADCgqTCMYpQcOv0oADi1qoaKikAvqBqooIxoABE+pyvANy9-YMjoCmu1A90ezze0As31+AyGoFGWjm1wQzBBDyeL1etHoTBYH3I0LcYHxkGMZks1lsjgcazC-hiMVgphcG10AEllAAOUAAXm2u32h3oAB5Kv5FBZEgAjDAWJROAA+oEU+ylzSVYqUktAMrlylASpVMTV4g1WHFFgAfD9WRA+gwqv1efy9gcjrBhdJkYkvSoDaBNRKfcj-YGrTbTgBZQRmZ2vTzQaCQV7+15EDSmQny1SaHQyeTDFygUDCEiiIgALnhReLClMVYuiiuN2FRpN1prxdiGgwpCrYZ+tdAMRj9dA0djho6pEHtcRsGRpgA+tcG5c0i3wPbKhp+h3i7dZwNKpXq0OMGPG82mcKOVhOfvaxpHDhBkuL1W26pZ8WsNhlv25paj+oAOFKpAYEQ0SXuui7ClKMbLF4j6Hi4twuC4Jh5E4phSs6TYZKUnCerIlqUKMpiLMsqyfrAGRTDMcxEAsSwrFg5GgYhtH0YhlDBLc-FcD8WGVAGqJ8vOyLwMwJFkbhQkYe44CtIwwiqBQUrCL25jiGogzoJ4TjYKApiCAw6BkKQiRZA8+nhG0lSJFEKysEySQWD22EtBEu66FU4EMD0Ik4WkahdM66Q9jhUo8AYbEAGIYpQrzHl0ry8HFqyUAA2q8F6vIkrx-lgyyvAAurwaDRHMyVgRBUFMgVbw8k1mikCQvCwAAHisjiwHxPyYQUolITpCEaKIKR8rilAAAbwAAosgC1bOAJY8N2vaJMIPAjmYTkiMolDQDwF7BAAgvAnEnvEnZDvdD2PQ9aSKKwfGgAA8gAagtABKVAfb90h-aAsj8KAJi5OxJ1nTIC3wFsF1XdApDaLAd1PZjtbxb9H2RiWZahMIoDLfFa0AFIfWyABy13hdAn20ydz64G+F7Ojt7PndT0igTwdWQdBGNY5jADqtR-Qt617VNoAACQAIzCyLj1nLjACqEyg+DnOmLNhUJkm6XCcNTgva5suRcZo2qONk0bT1Wh9QNRJDgAegA-IpYAckQF66BoYycHSXjpqsGAFNKSgpIHuJhIIChOFgCcxBgXU6lppA6Uk3iZCgoCqaoGCBS4VvRTw5qh9of4FHxDu9SolAaEQkCKFoVDml1wQ8paZ5JGgUV0l1PDCNApjIuAGgBbV0xpRlsDsaMAsNWO5pqSClXVf1rws6+ojvpmhUtYkCudY7zsKcWZcQ0iKjSaQsmUJ3XBzcDy3gFLON43ToTi5LSQvjZrLRWoBua82ph9Nay9oL61AKfeuTtG4KQEoNGa80lorTWuzL++NSyqF-hLX6UsZbOkVrAneEpRDJiEqAdwqgniiE-IIJwgcGhLHXoINQ3lhyjlANYfYLggA) <!-- playground:kysely --> to hover the types and edit the SQL, with nothing to install.

Pass the `DB` interface you give to `new Kysely<DB>()`:

<<< @/snippets/orm-kysely.ts#db

<<< @/snippets/orm-kysely.ts#query

Kysely describes a column by its TypeScript type, so the Postgres type is read back from that
type:

| Kysely column type | Postgres type |
|---|---|
| `number` / `string` / `boolean` / `bigint` | `int4` / `text` / `bool` / `int8` |
| `Date`, codegen's `Timestamp` | `timestamptz` |
| codegen's `Int8` / `Numeric` | `int8` / `numeric` |
| `Buffer`, `Uint8Array` | `bytea` |
| `Interval`, `Point`, `Circle` | `interval`, `point`, `circle` |
| `Json`, `JSONColumnType<T>`, other objects | `jsonb` |
| `T[]`, `ArrayType<T>` | element type `[]` |
| a union of string literals (codegen enums) | an enum, registered in `$types` |
| `T \| null` | nullable |
| `Generated<T>`, `GeneratedAlways<T>` | has a default: optional in `INSERT` |
| `"auth.users"` key | `auth.users` |

## Overrides

That mapping is lossy: `number` also stands for `int2`, `float4` and `float8`, `string` also
stands for `uuid`, `varchar` and `time`, and `Timestamp` also stands for `date` and `timestamp`.
Row types are the same either way. Expression types differ: division, aggregates, date
arithmetic. Pin the columns where it matters with the third type argument, keyed by the
interface's table and column keys:

<<< @/snippets/orm-kysely.ts#overrides

To get the exact types without listing overrides, generate the schema from the database
instead ([Introspection](../guide/introspect)) and keep Kysely for the queries it builds.

An override is a type name (`"float8"`) or a partial descriptor
(`{ type?, nullable?, hasDefault? }`). `{ $view: true }` marks a table as a view, so writes
to it are rejected. Without `$types`, each enum column gets its own name (`users.mood`). Two
columns then count as different enums, and `UNION`ing them is an error, just as it would be
for two different Postgres enums.

## camelCase

For an interface generated with `kysely-codegen --camel-case` (used with `CamelCasePlugin`),
pass `{ camelCase: true }`. SQL and rows then use the database's snake_case names:

<<< @/snippets/orm-kysely.ts#camel

For camelCase rows, as `CamelCasePlugin` would return them, pass `{ rowKeys: "camelCase" }`.
The top-level keys are renamed with the plugin's mapping, in the types and at runtime. The
plugin itself stays bypassed, so keys inside JSON values are not renamed. See
[camelCase row keys](../guide/queries#camelcase-row-keys).

<<< @/snippets/orm-kysely.ts#camel-rows

## Running queries

<<< @/snippets/orm-kysely.ts#run

The query is sent as `CompiledQuery.raw(text, values)` through `db.withoutPlugins()`. Logging,
the dialect and the pool still apply, but result transformers such as `CamelCasePlugin` do
not, so rows keep the keys their type says they have. `sql.transaction(fn)` runs in
`db.transaction().execute(...)`, and nests with a savepoint. Kysely's `PostgresDialect` runs on
`pg`. For the exact `pg` types (`Buffer` for `bytea`, interval objects), pass `PgTypeMap` as the
second type argument: `createSql<DB, PgTypeMap>(db)`.

## Limits

- JSON columns always count as nullable, because codegen's `JsonValue` includes `null`.
  Override `{ nullable: false }` to have `INSERT` require them.
- A column only has a default if it is declared `Generated`/`GeneratedAlways`. Mark other
  columns with `{ hasDefault: true }`.
- Views look like tables until you mark them with `$view: true`.
