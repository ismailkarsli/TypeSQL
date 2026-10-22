/**
 * What the adapters' `createSql(client)` returns: a `sql` whose queries run on `client`, and
 * `sql.transaction(fn)`, which runs `fn` with a `sql` bound to one transaction.
 */
import { createSql, type Sql } from "./create-sql.js";
import type { Executor } from "./query.js";
import type { RowKeys, SqlOptions } from "./row-keys.js";

/**
 * Core's `Sql` plus `transaction(fn)`: `fn` gets `tx`, the same `sql` bound to one transaction.
 * The transaction commits when `fn` resolves and rolls back when it throws (the error is
 * rethrown). `tx.transaction(fn)` nests with a savepoint.
 */
export interface TransactionalSql<DB, TM, Keys extends RowKeys = "preserve"> extends Sql<DB, TM, Keys> {
  transaction<T>(fn: (tx: TransactionalSql<DB, TM, Keys>) => Promise<T>): Promise<T>;
}

/** How an adapter runs statements and transactions on its driver's client `C`. */
export interface SqlDriver<C> {
  executor(client: C): Executor;
  /**
   * Run `fn` inside a transaction on `client` and resolve to its result: commit when `fn`
   * resolves, roll back and rethrow when it throws. `fn` gets the client bound to the
   * transaction. `depth` is how many `transaction` calls enclose this one (0 at the top), so a
   * client that cannot tell can use a savepoint when `depth > 0`.
   */
  transaction<T>(client: C, depth: number, fn: (tx: C) => Promise<T>): Promise<T>;
}

/**
 * For adapters: core's `createSql` bound to `driver.executor(client)`, with `transaction(fn)`
 * running on `driver.transaction`. Without a `client`, `execute*` and `transaction` reject.
 */
export function createTransactionalSql<DB, TM, C>(client: C | undefined, driver: SqlDriver<C>, options?: SqlOptions, depth = 0): TransactionalSql<DB, TM, RowKeys> {
  const sql = createSql<DB, TM>(client === undefined ? undefined : driver.executor(client), options as { readonly rowKeys: "camelCase" });
  return Object.assign(sql, {
    transaction: async <T>(fn: (tx: TransactionalSql<DB, TM, RowKeys>) => Promise<T>): Promise<T> => {
      if (client === undefined) throw new Error("typesql: no client: pass one to createSql(client) to use sql.transaction()");
      return driver.transaction(client, depth, (tx) => fn(createTransactionalSql<DB, TM, C>(tx, driver, options, depth + 1)));
    },
  }) as unknown as TransactionalSql<DB, TM, RowKeys>;
}

/**
 * For drivers without a transaction API: run `fn` between `BEGIN` and `COMMIT` sent with `run`
 * on one connection, or between `SAVEPOINT name` and `RELEASE SAVEPOINT name` when `savepoint`
 * is given (inside a transaction). When `fn` or the commit throws, it rolls back (`ROLLBACK`,
 * `ROLLBACK TO SAVEPOINT name`) and rethrows that error; if the rollback fails too, its error is
 * passed to `onRollbackError` and the original is still thrown. A failing `BEGIN` is thrown as is.
 */
export async function runTransaction<T>(
  run: (statement: string) => PromiseLike<unknown>,
  fn: () => Promise<T>,
  options: { readonly savepoint?: string; readonly onRollbackError?: (err: unknown) => void } = {},
): Promise<T> {
  const sp = options.savepoint;
  await run(sp ? `SAVEPOINT ${sp}` : "BEGIN");
  try {
    const result = await fn();
    await run(sp ? `RELEASE SAVEPOINT ${sp}` : "COMMIT");
    return result;
  } catch (err) {
    try {
      await run(sp ? `ROLLBACK TO SAVEPOINT ${sp}` : "ROLLBACK");
    } catch (rollbackErr) {
      options.onRollbackError?.(rollbackErr);
    }
    throw err;
  }
}
