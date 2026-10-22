/**
 * Runtime query object: `{ text, values }` plus phantom row/param/text types, and `execute*`
 * methods that run it. A `Fragment` is a piece of SQL that can be spliced into a query via `{slot}`.
 */
import { applyRowKeys, type RowKeys } from "./row-keys.js";

export declare const ROW: unique symbol;
export declare const PARAMS: unique symbol;
export declare const TEXT: unique symbol;
export declare const CARRIED: unique symbol;

/**
 * What an `Executor` resolves to when it knows the statement's row count, as Postgres reports it
 * in the command tag: rows affected by `INSERT`, `UPDATE`, `DELETE` or `MERGE` (with or without
 * `RETURNING`), rows returned by `SELECT`. `null` means the statement has no count (DDL,
 * `BEGIN`…), which `executeCount` reads as 0.
 */
export interface ExecutorResult {
  readonly rows: readonly unknown[];
  readonly rowCount: number | null;
}

/**
 * Runs a statement and resolves to its rows, or to `{ rows, rowCount }`. Adapters build one from a
 * driver client (`executor(pool)` in `@typesql/pg`, which reports `rowCount`); pass it to
 * `createSql(executor)` or to `q.execute(executor)`. An executor that resolves to the rows alone
 * works for everything except `executeCount`, unless it also has a `count` method.
 */
export type Executor = ((text: string, values: readonly unknown[]) => PromiseLike<readonly unknown[] | ExecutorResult>) & {
  /** Runs the statement for its row count; `executeCount` uses it when present (Prisma's `$executeRaw`). */
  readonly count?: (text: string, values: readonly unknown[]) => PromiseLike<number>;
};

/** Thrown by `executeTakeFirstOrThrow` when the query returns no rows. */
export class NoResultError extends Error {
  override readonly name = "NoResultError";
  readonly text: string;
  constructor(text: string) {
    super("The query returned no rows");
    this.text = text;
  }
}

export interface Query<Row, Params extends readonly unknown[] = readonly unknown[], Text extends string = string> {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly [ROW]?: Row;
  readonly [PARAMS]?: Params;
  readonly [TEXT]?: Text;
  /** Run the query and return all rows. Uses `executor` if given, else the one bound by `createSql(executor)`. */
  execute(executor?: Executor): Promise<Row[]>;
  /** The first row, or `undefined` when there are none. */
  executeTakeFirst(executor?: Executor): Promise<Row | undefined>;
  /** The first row; throws `NoResultError` when there are none. */
  executeTakeFirstOrThrow(executor?: Executor): Promise<Row>;
  /**
   * Run the statement and return its row count: rows affected by `INSERT`/`UPDATE`/`DELETE`/`MERGE`
   * (with or without `RETURNING`), rows returned by `SELECT`, 0 for statements without a count.
   * Rejects when the executor resolves to rows alone, since it cannot tell the count.
   */
  executeCount(executor?: Executor): Promise<number>;
}

/**
 * A spliceable piece of SQL. `Text` is the literal when known, `string` when dynamic.
 * `Carried` records the TS types of the values the fragment carries (encoded, one per `$n`),
 * so they can be checked against the parameter types once the fragment is spliced.
 */
export interface Fragment<Text extends string = string, Params extends readonly unknown[] = readonly unknown[], Carried extends readonly unknown[] = readonly unknown[]> {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly [TEXT]?: Text;
  readonly [PARAMS]?: Params;
  readonly [CARRIED]?: Carried;
}

export type RowType<Q> = Q extends Query<infer R, readonly unknown[], string> ? R : never;
export type ParamsType<Q> = Q extends { readonly [PARAMS]?: infer P } ? P : never;
export type TextType<Q> = Q extends { readonly [TEXT]?: infer T extends string } ? T : string;

/** Where a query keeps its `rowKeys` (non-enumerable); `Symbol.for` so copies of core agree. */
const ROW_KEYS = Symbol.for("typesql.rowKeys");

/**
 * Turn rows a driver returned for `q` into the rows `q`'s type describes: a fresh array, with
 * the keys renamed when `q` comes from `createSql(executor, { rowKeys: "camelCase" })`. For
 * helpers that run `q.text` themselves instead of through an `Executor`.
 */
export function mapRows<Q extends { readonly text: string }>(q: Q, rows: readonly unknown[]): RowType<Q>[] {
  return applyRowKeys(rows, rowKeysOf(q)) as RowType<Q>[];
}

/** The `rowKeys` option of the `createSql` that built `q` (`"preserve"` for anything else). */
export function rowKeysOf(q: { readonly text: string }): RowKeys {
  return (q as { readonly [ROW_KEYS]?: RowKeys })[ROW_KEYS] ?? "preserve";
}

/**
 * A plain object whose `execute*` methods are non-enumerable, so it still deep-equals
 * `{ text, values }` (strictly, too). `rowKeys` renames the keys of the rows `execute*` return.
 */
export function makeQuery<Row, Params extends readonly unknown[], Text extends string = string>(
  text: string,
  values: readonly unknown[],
  executor?: Executor,
  rowKeys: RowKeys = "preserve",
): Query<Row, Params, Text> {
  const pick = (given?: Executor): Executor => {
    const exec = given ?? executor;
    if (!exec) throw new Error("typesql: no executor: pass one to createSql(executor) or to execute(executor)");
    return exec;
  };
  const execute = async (given?: Executor): Promise<unknown[]> => {
    const result = await pick(given)(text, values);
    return applyRowKeys(isRows(result) ? result : result.rows, rowKeys);
  };
  return Object.defineProperties({ text, values }, {
    [ROW_KEYS]: { value: rowKeys },
    execute: { value: execute },
    executeCount: {
      value: async (given?: Executor) => {
        const exec = pick(given);
        if (exec.count) return exec.count(text, values);
        const result = await exec(text, values);
        if (isRows(result) || result.rowCount === undefined) {
          throw new Error("typesql: the executor did not report a row count: resolve to { rows, rowCount } (the adapters' executor() do)");
        }
        return result.rowCount ?? 0;
      },
    },
    executeTakeFirst: { value: async (given?: Executor) => (await execute(given))[0] },
    executeTakeFirstOrThrow: {
      value: async (given?: Executor) => {
        const rows = await execute(given);
        if (rows.length === 0) throw new NoResultError(text);
        return rows[0];
      },
    },
  }) as unknown as Query<Row, Params, Text>;
}

function isRows(result: readonly unknown[] | ExecutorResult): result is readonly unknown[] {
  return Array.isArray(result);
}

export function makeFragment<Text extends string, Params extends readonly unknown[], Carried extends readonly unknown[] = readonly unknown[]>(text: string, values: readonly unknown[]): Fragment<Text, Params, Carried> {
  return { text, values };
}
