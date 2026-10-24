# Transactions

`sql.transaction(fn)` runs several statements in one transaction. It works the same way with every adapter.

<<< @/snippets/transactions.ts#basic

`fn` receives `tx`, the same `sql` bound to the transaction. It has the same types and helpers as `sql`.

- When `fn` resolves, the transaction commits and `sql.transaction` resolves to `fn`'s result.
- When `fn` throws, the transaction rolls back and the error is rethrown.

`sql.transaction` needs a client. On a `sql` from `createSql<DB>()` without one, it rejects.

## Nested transactions

`tx.transaction(fn)` nests with a savepoint. When the inner `fn` throws, only what ran inside it is rolled back:

<<< @/snippets/adapters.ts#transaction

A `sql` bound to a client that is already in a transaction also uses a savepoint. That covers a postgres.js `TransactionSql`, a Kysely `Transaction`, a Prisma transaction client and a Drizzle `tx`.

## One statement at a time

::: warning
Statements in one transaction share one connection. Run them one after another, not with `Promise.all`.
:::

<<< @/snippets/transactions.ts#sequential

## How each adapter runs it

| Adapter | `sql.transaction(fn)` | `tx.transaction(fn)` |
|---|---|---|
| `@typesql/pg` | on a `Pool`: checks out a client, runs `BEGIN`…`COMMIT` on it, releases it. On a `Client` or `PoolClient`: `BEGIN`…`COMMIT` on it | `SAVEPOINT` |
| `@typesql/postgres` | `sql.begin(fn)` | `tx.savepoint(fn)` |
| `@typesql/kysely` | `db.transaction().execute(fn)` | `SAVEPOINT` on the transaction |
| `@typesql/prisma` | `prisma.$transaction(fn)` (interactive) | `SAVEPOINT` on the transaction client |
| `@typesql/drizzle` | `db.transaction(fn)` | Drizzle's nested `tx.transaction(fn)` (a savepoint) |

More on each driver: [node-postgres](../adapters/pg), [postgres.js](../adapters/postgres), and [Kysely, Drizzle and Prisma](./orms).
