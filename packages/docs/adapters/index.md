# Adapters

`@typesql/core` is type-only: `sql("SELECT …", …params)` returns `{ text, values }` plus phantom
`Row`/`Params` types. An adapter adds two things for one driver or ORM:

1. a **type map** describing how that driver's *default* parsers turn each Postgres type into a
   JS value;
2. a `createSql<DB>(client)` that uses that map and runs the queries on `client`, with
   `sql.transaction(fn)` for transactions.

| Package | Runs queries with | Schema from | Default type map |
|---|---|---|---|
| [`@typesql/pg`](./pg) | node-postgres 8.x: `Pool`, `Client`, `PoolClient` | your `DB` interface | `PgTypeMap` |
| [`@typesql/postgres`](./postgres) | postgres.js 3.x: `Sql`, `TransactionSql`, `ReservedSql` | your `DB` interface | `PostgresJsTypeMap`, `PostgresJsBigIntTypeMap` |
| [`@typesql/kysely`](./kysely) | a `Kysely` or `Transaction` | your Kysely `DB` interface (kysely-codegen, prisma-kysely, hand-written) | `DefaultTypeMap` (node-postgres) |
| [`@typesql/drizzle`](./drizzle) | a Drizzle database or transaction, on node-postgres or postgres.js | `typeof schema`: your `pgTable`, `pgView`, `pgEnum`, `pgSchema` exports | `DefaultTypeMap` (node-postgres) |
| [`@typesql/prisma`](./prisma) | Prisma Client or a transaction client | the `typesql-prisma` generator, or the generated client's `Prisma.TypeMap` | `PrismaTypeMap` (`$queryRaw` results) |

The client parameters are structural, so fakes work in tests without the driver.

## ORM schemas

If your database is already described for Kysely, Drizzle or Prisma, you do not need to write
the schema interface again. Their packages turn the ORM's types into the `DB` that `createSql`
expects, so you can write SQL next to your ORM code, checked against the same tables.

The Kysely and Drizzle conversions happen only at the type level: there is no code generation
and no database connection. Prisma's types leave out the database names and native types, so
`@typesql/prisma` also has a generator that writes the exact schema.

The ORM's types say less than the database does, so each conversion has some gaps. They are
listed on each package's page. Each package's `createSql` passes extra type arguments through,
so you can fill those gaps in.

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
`execute*` alike. See [camelCase row keys](../guide/queries#camelcase-row-keys).

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
   use a [type map](../guide/schema#type-maps) that says so: `createSql<DB, MyTypeMap>(executor)`.
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

The full tables are on each page: [`PgTypeMap`](./pg#pgtypemap),
[`PostgresJsTypeMap`](./postgres#postgresjstypemap-and-postgresjsbiginttypemap) and
[`PrismaTypeMap`](./prisma#prismatypemap). Kysely and Drizzle run on one of the two drivers;
see their pages for the type map to pass.
