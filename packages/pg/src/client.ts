import { mapRows, type Executor, type Query, type RowType } from "@typesql/core";

/** The subset of a `pg` query result the helpers rely on. */
export interface PgResult {
  readonly rows: unknown[];
  readonly rowCount: number | null;
}

/**
 * Anything with node-postgres' `query(text, values)` method: `Pool`, `Client`, `PoolClient`,
 * or a fake in tests. Only the `(text, values?) → Promise<{ rows, rowCount }>` form is used.
 */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<PgResult>;
}

/** A client checked out of a pool (`pg.PoolClient`): queryable and releasable. */
export interface PgTransactionClient extends PgQueryable {
  release(err?: Error | boolean): void;
}

/** Anything with `pg.Pool`'s `connect()`. */
export interface PgPoolLike<C extends PgTransactionClient = PgTransactionClient> {
  connect(): Promise<C>;
}

/** Thrown by `one`, `maybeOne` and `many` when the row count does not match. */
export class RowCountError extends Error {
  override readonly name = "RowCountError";
  constructor(
    readonly code: "NO_ROWS" | "TOO_MANY_ROWS",
    readonly expected: string,
    readonly actual: number,
    readonly text: string,
  ) {
    super(`Expected ${expected} row(s) but the query returned ${actual}`);
  }
}

type AnyQuery = Query<unknown, readonly unknown[]>;

function run(client: PgQueryable, q: AnyQuery): Promise<PgResult> {
  // `pg` requires a mutable array (`QueryConfigValues<I>` matches `Array<U>` only).
  return client.query(q.text, Array.from(q.values));
}

/**
 * An `Executor` for core's `q.execute()`: runs queries on `client` and resolves to
 * `{ rows, rowCount }` (pg's `rowCount`, so `q.executeCount()` works).
 */
export function executor(client: PgQueryable): Executor {
  return async (text, values) => {
    const { rows, rowCount } = await client.query(text, Array.from(values));
    return { rows, rowCount };
  };
}

/** Run a query and return all rows, typed from the query. */
export async function query<Q extends AnyQuery>(client: PgQueryable, q: Q): Promise<RowType<Q>[]> {
  const result = await run(client, q);
  return mapRows(q, result.rows);
}

/** Exactly one row, otherwise throws `RowCountError`. */
export async function one<Q extends AnyQuery>(client: PgQueryable, q: Q): Promise<RowType<Q>> {
  const rows = await query(client, q);
  if (rows.length !== 1) {
    throw new RowCountError(rows.length === 0 ? "NO_ROWS" : "TOO_MANY_ROWS", "exactly 1", rows.length, q.text);
  }
  return rows[0] as RowType<Q>;
}

/** Zero or one row (`null` for zero); throws `RowCountError` on more than one. */
export async function maybeOne<Q extends AnyQuery>(client: PgQueryable, q: Q): Promise<RowType<Q> | null> {
  const rows = await query(client, q);
  if (rows.length > 1) throw new RowCountError("TOO_MANY_ROWS", "at most 1", rows.length, q.text);
  return rows.length === 0 ? null : (rows[0] as RowType<Q>);
}

/** At least one row, otherwise throws `RowCountError`. */
export async function many<Q extends AnyQuery>(client: PgQueryable, q: Q): Promise<[RowType<Q>, ...RowType<Q>[]]> {
  const rows = await query(client, q);
  if (rows.length === 0) throw new RowCountError("NO_ROWS", "at least 1", 0, q.text);
  return rows as [RowType<Q>, ...RowType<Q>[]];
}

/** Run a statement for its side effect and return the affected row count (`rowCount ?? 0`). */
export async function execute(client: PgQueryable, q: AnyQuery): Promise<number> {
  const result = await run(client, q);
  return result.rowCount ?? 0;
}

/**
 * Check out a client, run `fn` inside BEGIN/COMMIT, ROLLBACK on error, and release the
 * client. If ROLLBACK itself fails the client is released with the error so the pool
 * discards the connection instead of reusing it.
 */
export async function transaction<C extends PgTransactionClient, T>(
  pool: PgPoolLike<C>,
  fn: (client: C) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let releaseWith: Error | undefined;
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        releaseWith = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
      }
      throw err;
    }
  } finally {
    client.release(releaseWith);
  }
}

/** Anything carrying an ordered list of DDL statements, e.g. a `migrations()` builder from core. */
export interface MigrationSource {
  readonly statements: readonly string[];
}

/**
 * Run a migration's statements in order on one connection, inside a single transaction
 * (all or nothing). Statements are sent as simple queries without parameters, so scripts
 * with `$$`-quoted function bodies work.
 */
export async function migrate<C extends PgTransactionClient>(pool: PgPoolLike<C>, m: MigrationSource): Promise<void> {
  await transaction(pool, async (client) => {
    for (const statement of m.statements) await client.query(statement);
  });
}
