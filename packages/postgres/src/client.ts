import type { Query, RowType } from "typesql";

/** The shape of a resolved `sql.unsafe()` result the helpers rely on: an array with `count`. */
export type PostgresJsRows = readonly unknown[] & { readonly count: number };

/**
 * Anything with postgres.js' `unsafe(query, parameters)` method: the `Sql` instance,
 * a `TransactionSql` inside `begin`, a `ReservedSql`, or a fake in tests.
 */
export interface PostgresJsQueryable {
  unsafe(query: string, parameters?: unknown[]): PromiseLike<PostgresJsRows>;
}

/** Anything with postgres.js' `begin(fn)`: the `Sql` instance or a `ReservedSql`. */
export interface PostgresJsTransactable<Tx extends PostgresJsQueryable = PostgresJsQueryable> {
  begin(fn: (tx: Tx) => Promise<unknown>): Promise<unknown>;
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

function run(sql: PostgresJsQueryable, q: AnyQuery): PromiseLike<PostgresJsRows> {
  return sql.unsafe(q.text, Array.from(q.values));
}

/** Run a query and return all rows (a plain array, without postgres.js' result metadata). */
export async function query<Q extends AnyQuery>(sql: PostgresJsQueryable, q: Q): Promise<RowType<Q>[]> {
  const result = await run(sql, q);
  return Array.from(result) as RowType<Q>[];
}

/** Exactly one row, otherwise throws `RowCountError`. */
export async function one<Q extends AnyQuery>(sql: PostgresJsQueryable, q: Q): Promise<RowType<Q>> {
  const rows = await query(sql, q);
  if (rows.length !== 1) {
    throw new RowCountError(rows.length === 0 ? "NO_ROWS" : "TOO_MANY_ROWS", "exactly 1", rows.length, q.text);
  }
  return rows[0] as RowType<Q>;
}

/** Zero or one row (`null` for zero); throws `RowCountError` on more than one. */
export async function maybeOne<Q extends AnyQuery>(sql: PostgresJsQueryable, q: Q): Promise<RowType<Q> | null> {
  const rows = await query(sql, q);
  if (rows.length > 1) throw new RowCountError("TOO_MANY_ROWS", "at most 1", rows.length, q.text);
  return rows.length === 0 ? null : (rows[0] as RowType<Q>);
}

/** At least one row, otherwise throws `RowCountError`. */
export async function many<Q extends AnyQuery>(sql: PostgresJsQueryable, q: Q): Promise<[RowType<Q>, ...RowType<Q>[]]> {
  const rows = await query(sql, q);
  if (rows.length === 0) throw new RowCountError("NO_ROWS", "at least 1", 0, q.text);
  return rows as [RowType<Q>, ...RowType<Q>[]];
}

/** Run a statement for its side effect and return the affected row count (postgres.js' `.count`). */
export async function execute(sql: PostgresJsQueryable, q: AnyQuery): Promise<number> {
  const result = await run(sql, q);
  return result.count;
}

/**
 * Run `fn` inside `sql.begin()`: postgres.js issues BEGIN, runs the callback with a
 * transaction-bound `sql`, then COMMIT — or ROLLBACK and rethrow if the callback throws.
 */
export async function transaction<Tx extends PostgresJsQueryable, T>(
  sql: PostgresJsTransactable<Tx>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return (await sql.begin(fn)) as T;
}

/** Anything carrying an ordered list of DDL statements, e.g. a `migrations()` builder from core. */
export interface MigrationSource {
  readonly statements: readonly string[];
}

/**
 * Run a migration's statements in order inside one transaction (`sql.begin`), all or nothing.
 * Each statement goes through `unsafe` without parameters (simple protocol), so scripts with
 * `$$`-quoted function bodies work.
 */
export async function migrate<Tx extends PostgresJsQueryable>(sql: PostgresJsTransactable<Tx>, m: MigrationSource): Promise<void> {
  await transaction(sql, async (tx) => {
    for (const statement of m.statements) await tx.unsafe(statement);
  });
}
