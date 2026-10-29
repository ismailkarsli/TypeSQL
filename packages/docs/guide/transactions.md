# Transactions

`sql.transaction(fn)` runs several statements in one transaction. It works the same way with every adapter.

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const sql = createSql<DB>(new Pool());

const userId = await sql.transaction(async (tx) => {
	const { id } = await tx(
		"INSERT INTO users (email) VALUES ($1) RETURNING id",
		"ada@example.com",
	).executeTakeFirstOrThrow();
	await tx(
		"INSERT INTO posts (author_id, title) VALUES ($1, $2)",
		id,
		"Hello",
	).execute();
	return id;
});
```

`fn` receives `tx`, the same `sql` bound to the transaction. It has the same types and helpers as `sql`.

- When `fn` resolves, the transaction commits and `sql.transaction` resolves to `fn`'s result.
- When `fn` throws, the transaction rolls back and the error is rethrown.

`sql.transaction` needs a client. On a `sql` from `createSql<DB>()` without one, it rejects.

## Nested transactions

`tx.transaction(fn)` nests with a savepoint. When the inner `fn` throws, only what ran inside it is rolled back:

```ts
const postId = await sql.transaction(async (tx) => {
	const { id } = await tx(
		"INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id",
		7,
		"Draft",
	).executeTakeFirstOrThrow();
	try {
		await tx.transaction(async (inner) => {
			await inner(
				"UPDATE users SET display_name = $1 WHERE id = $2",
				"Author",
				7,
			).execute();
		});
	} catch {}
	return id;
});
```

A `sql` bound to a client that is already in a transaction also uses a savepoint. That covers a postgres.js `TransactionSql`, a Kysely `Transaction`, a Prisma transaction client and a Drizzle `tx`.

## One statement at a time

::: warning
Statements in one transaction share one connection. Run them one after another, not with `Promise.all`.
:::

```ts
await sql.transaction(async (tx) => {
	await tx(
		"UPDATE users SET display_name = $1 WHERE id = $2",
		"Ada",
		1,
	).execute();
	await tx(
		"UPDATE users SET display_name = $1 WHERE id = $2",
		"Grace",
		2,
	).execute();
});
```

## How each adapter runs it

| Adapter | `sql.transaction(fn)` | `tx.transaction(fn)` |
|---|---|---|
| `@typesql/pg` | on a `Pool`: checks out a client, runs `BEGIN`…`COMMIT` on it, releases it. On a `Client` or `PoolClient`: `BEGIN`…`COMMIT` on it | `SAVEPOINT` |
| `@typesql/postgres` | `sql.begin(fn)` | `tx.savepoint(fn)` |
| `@typesql/kysely` | `db.transaction().execute(fn)` | `SAVEPOINT` on the transaction |
| `@typesql/prisma` | `prisma.$transaction(fn)` (interactive) | `SAVEPOINT` on the transaction client |
| `@typesql/drizzle` | `db.transaction(fn)` | Drizzle's nested `tx.transaction(fn)` (a savepoint) |

More on each driver: [node-postgres](../adapters/pg), [postgres.js](../adapters/postgres), and [Kysely, Drizzle and Prisma](./orms).
