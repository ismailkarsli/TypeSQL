# @typesql/effect

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries as [Effects](https://effect.website) on an Effect `SqlClient`: `@effect/sql-pg`, `@effect/sql-sqlite-node` or `@effect/sql-mysql2`. A statement is the Effect of its typed rows, and fails with the client's `SqlError`.

## Install

```sh
pnpm add @typesql/core @typesql/effect effect @effect/sql-pg
```

It needs `effect` 4.1.3 or later.

## Usage

```ts
import { PgClient } from "@effect/sql-pg";
import { postgresDialect } from "@typesql/core/postgres";
import { createSql } from "@typesql/effect";
import { Effect, Redacted } from "effect";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(postgresDialect);

const program = Effect.gen(function* () {
  // A statement is an Effect: yield it, or call exec().
  const users = yield* sql("SELECT id, email FROM users");

  const user = yield* sql(
    `SELECT id, email FROM users WHERE id = ${sql.param(1)}`,
  ).execTakeFirst();

  yield* sql.withTransaction(
    sql(`UPDATE posts SET published = true WHERE author_id = ${sql.param(user.id)}`),
  );
  return users;
});

await Effect.runPromise(
  program.pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(process.env["DATABASE_URL"]!) })),
  ),
);
```

- Without a client, statements run on the fiber's `SqlClient` and require it. `createSql<DB>(postgresDialect, client)` binds one, and its statements require nothing.
- `exec()`, `execTakeFirstOrNone()`, `execTakeFirst()` and `execCount()` return Effects, and `stream()` a `Stream`. `execTakeFirst()` fails with the tagged `NoResultError`.
- `sql.withTransaction(effect)` is the client's `withTransaction`: a failure rolls back, and inside another transaction it is a savepoint.
- `${query}` splices a statement as a subquery, as on every TypeSQL adapter.
- Rows keep the database's column names; attach `CasePlugin` from `@typesql/core/plugins` for camelCase keys.

## SQLite, MySQL and MariaDB

Pass `sqliteDialect` from `@typesql/core/sqlite` with `@effect/sql-sqlite-node`, or `mysqlDialect` or `mariadbDialect` from `@typesql/core/mysql` with `@effect/sql-mysql2`.

## Types

Rows are typed as the driver returns them. On PostgreSQL that is `EffectPgTypeMap`: `int8` is a `bigint`, `date` its text, `time` a `bigint` of microseconds and `interval` an `EffectPgInterval`. On MySQL and MariaDB, `BIGINT` is `number | string`.

## Documentation

See [Effect](https://typesql.karsli.net/adapters/effect) and [Type mapping](https://typesql.karsli.net/reference/type-mapping#effect).

## License

[MIT](LICENSE)
