/**
 * Runtime query object: `{ text, values }` plus phantom row/param/text types, and `execute*`
 * methods that run it. A `Fragment` is a piece of SQL that can be spliced into a query via `{slot}`.
 */
export declare const ROW: unique symbol;
export declare const PARAMS: unique symbol;
export declare const TEXT: unique symbol;
export declare const CARRIED: unique symbol;

/**
 * Runs a statement and resolves to its rows. Adapters build one from a driver client
 * (`executor(pool)` in `@typesql/pg`); pass it to `createSql(executor)` or to `q.execute(executor)`.
 */
export type Executor = (text: string, values: readonly unknown[]) => PromiseLike<readonly unknown[]>;

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

/**
 * A plain object whose `execute*` methods are non-enumerable, so it still deep-equals
 * `{ text, values }` (strictly, too).
 */
export function makeQuery<Row, Params extends readonly unknown[], Text extends string = string>(text: string, values: readonly unknown[], executor?: Executor): Query<Row, Params, Text> {
  const execute = async (given?: Executor): Promise<unknown[]> => {
    const run = given ?? executor;
    if (!run) throw new Error("typesql: no executor: pass one to createSql(executor) or to execute(executor)");
    return Array.from(await run(text, values));
  };
  return Object.defineProperties({ text, values }, {
    execute: { value: execute },
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

export function makeFragment<Text extends string, Params extends readonly unknown[], Carried extends readonly unknown[] = readonly unknown[]>(text: string, values: readonly unknown[]): Fragment<Text, Params, Carried> {
  return { text, values };
}
