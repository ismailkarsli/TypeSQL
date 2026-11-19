# Effect

`pnpm add @typesql/core @typesql/effect effect @effect/sql-pg` (`effect` 4.1.3+; `@effect/sql-sqlite-node` or `@effect/sql-mysql2` for the other databases). The dialect goes first.

```ts
import { postgresDialect } from "@typesql/core/postgres";
import { createSql } from "@typesql/effect";
import { Effect } from "effect";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(postgresDialect);

const program = Effect.gen(function* () {
	const users = yield* sql("SELECT id, email FROM users");
	const user = yield* sql("SELECT id FROM users WHERE id = $1", 1).execOne();
	yield* sql.withTransaction(sql("DELETE FROM posts WHERE author_id = $1", user.id));
});
```

- A statement is an Effect of its rows (`yield*` it); `exec*()` return Effects and `stream()` a `Stream`. Nothing is a Promise: no `await`, no `sql.transaction(fn)`, no `tx`.
- Without a client, statements require `SqlClient` (provide the driver's layer). `createSql<DB>(dialect, client)` binds one.
- Errors are the client's `SqlError`, plus the tagged `NoResultError` from `execOne()` and `TooManyRowsError` from `execOne()` and `execOneOrNone()`.
- `sql.withTransaction(effect)` rolls back on failure and nests as a savepoint.
- The client's `transformResultNames` is bypassed, so use TypeSQL's `CasePlugin`.

**Rows on PostgreSQL** (`EffectPgTypeMap`):
- `bigint`: `int8` (`count(*)`), `time` (microseconds).
- `string`: `numeric`, `date`, `uuid`, `timetz`.
- `Date`: `timestamp`, `timestamptz`.
- Other: `interval` is `{ months, days, microseconds }`, `bytea` is `Uint8Array`, `regclass` is a `number`.
- No codec, so the statement fails: `money`, ranges, geometric types, `bit`, `tsvector`, enum arrays, nested arrays. Cast to `text` (or `text[]`) in SQL.

**Rows on MySQL** (`EffectMysqlTypeMap`): as mysql2, with `BIGINT` as `number | string`. **SQLite:** as node:sqlite; `stream()` is not supported there.

**Parameters:** a `time` takes its text, not the `bigint` a row has.
