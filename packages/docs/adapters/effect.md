---
description: "Run TypeSQL queries as Effects with @typesql/effect: statements you yield, typed errors, transactions and streams on an Effect SqlClient for PostgreSQL, SQLite, MySQL and MariaDB."
---

# Effect

`@typesql/effect` runs your queries as [Effects](https://effect.website) on an Effect `SqlClient`. A statement is the Effect of its rows, so you `yield*` it, and it fails with the client's `SqlError`.

| Database | Driver package | Dialect |
|---|---|---|
| PostgreSQL | `@effect/sql-pg` | `postgresDialect` from `@typesql/core/postgres` |
| SQLite | `@effect/sql-sqlite-node` | `sqliteDialect` from `@typesql/core/sqlite` |
| MySQL, MariaDB | `@effect/sql-mysql2` | `mysqlDialect` or `mariadbDialect` from `@typesql/core/mysql` |

```sh
pnpm add @typesql/core @typesql/effect effect @effect/sql-pg
```

It needs `effect` 4.1.3 or later. The schema is a TypeSQL one: [declare it](../guide/schema), or generate it [from the database](../guide/introspect).

## Create `sql`

`createSql` takes the dialect. Without a client, statements run on the `SqlClient` of the fiber that runs them, so they require it like any other service:

```ts
import { PgClient } from "@effect/sql-pg";
import { postgresDialect } from "@typesql/core/postgres";
import { createSql } from "@typesql/effect";
import { Effect, Redacted } from "effect";

const sql = createSql<DB>(postgresDialect);

const program = Effect.gen(function* () {
	const users = yield* sql("SELECT id, email FROM users");
	return users.length;
});

await Effect.runPromise(
	program.pipe(
		Effect.provide(
			PgClient.layer({ url: Redacted.make(process.env["DATABASE_URL"]!) }),
		),
	),
);
```

With a client, they run on that one and require nothing:

```ts
import { SqlClient } from "effect/sql/SqlClient";

const users = Effect.gen(function* () {
	const client = yield* SqlClient;
	const sql = createSql<DB>(postgresDialect, client);
	// The statement itself is an Effect<…, SqlError, never>.
	return yield* sql("SELECT id, email FROM users");
});
```

## Run queries

A statement is an Effect, the same one as `exec()`: yield it, pipe it, or pass it to any function that takes an Effect.

| | Effect of | Fails with |
|---|---|---|
| `yield* q`, `q.exec()` | `Row[]` | `SqlError` |
| `q.execTakeFirstOrNone()` | `Row \| undefined` | `SqlError` |
| `q.execTakeFirst()` | `Row` | `SqlError \| NoResultError` |
| `q.execCount()` | `number`: the rows changed or returned | `SqlError` |
| `q.stream()` | a `Stream` of `Row` | `SqlError` |

```ts
import { Effect, Stream } from "effect";

const program = Effect.gen(function* () {
	const user = yield* sql(
		`SELECT id, email FROM users WHERE id = ${sql.param(7)}`,
	).execTakeFirst();

	const emails = yield* sql("SELECT email FROM users").pipe(
		Effect.map((users) => users.map((user) => user.email)),
	);

	const changed = yield* sql(
		"UPDATE users SET display_name = NULL",
	).execCount();

	yield* sql("SELECT id FROM users").stream().pipe(
		Stream.runForEach((user) => Effect.log(user.id)),
	);
});
```

- `NoResultError`, from `@typesql/effect`, is a tagged error with the statement's `text`: handle it with `Effect.catchTag("NoResultError", …)`.
- `stream()` reads rows as the driver streams them. `@effect/sql-sqlite-node` has no streaming, so there it dies; use `exec()`.
- `${query}` splices a statement as a [subquery](../guide/using-sql#fragments), and everything else on `sql` (`sql.param`, `sql.fragment`, `sql.values`, `sql.prepare`, …) works as on every adapter.
- Statements run through the client's `unsafe`, so they are traced like the client's own.

## Transactions

`sql.withTransaction(effect)` is the client's `withTransaction`. The statements `effect` runs are the transaction's, a failure rolls it back, and inside another transaction it is a savepoint. There is no `tx`: the same `sql` runs in the transaction.

```ts
const id = yield* sql.withTransaction(
	Effect.gen(function* () {
		const { id } = yield* sql(
			`INSERT INTO users (email) VALUES (${sql.param("a@b.c")}) RETURNING id`,
		).execTakeFirst();
		yield* sql(
			`INSERT INTO posts (author_id, title) VALUES (${sql.param(id)}, ${sql.param("Hello")})`,
		);
		return id;
	}),
);
```

It takes one argument, so it pipes: `effect.pipe(sql.withTransaction)`. The client's own `client.withTransaction(effect)` does the same.

## Row names and plugins

Rows keep the database's column names: the client's `transformResultNames` is bypassed, since the types describe the names the database returns. Attach [`CasePlugin`](../guide/case-plugin) for camelCase keys:

```ts
import { CasePlugin } from "@typesql/core/plugins";

const camel = sql.withPlugin(new CasePlugin());
const users = yield* camel("SELECT display_name FROM users"); // { displayName }[]
```

## Types

Rows are typed as each driver returns them. Pass another [type map](../reference/type-mapping#custom-type-maps) as the second type argument when your client is configured differently.

- **PostgreSQL:** `EffectPgTypeMap`. `int8` (so `count(*)`) is a `bigint`, `numeric` a string, `timestamp` and `timestamptz` a `Date`, `date` its text, `time` a `bigint` of microseconds and `interval` an `EffectPgInterval`. Types the driver has no codec for are `unknown`. See [Type mapping](../reference/type-mapping#effect).
- **SQLite:** SQLite's `DefaultTypeMap`, as for [node:sqlite](./sqlite#types).
- **MySQL and MariaDB:** `EffectMysqlTypeMap`. It is mysql2's map, with `BIGINT` as `number | string`: the driver sets `supportBigNumbers`, so a value past 2^53 is a string.

## Parameters

Values are bound by the driver, with two exceptions on PostgreSQL. An array is sent as PostgreSQL's array text and `sql.json(value)` as JSON text, so the server reads them as the parameter's type. The driver alone would send an array of strings as `text[]`, which a `uuid[]` or `int8[]` parameter rejects.

On SQLite and MySQL, values are converted as on [`@typesql/sqlite`](./sqlite#run-queries) and [`@typesql/mysql`](./mysql).
