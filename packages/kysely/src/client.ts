import { CompiledQuery, type QueryResult } from "kysely";
import type { Executor, Query, RowType } from "@typesql/core";

/**
 * What the helpers use from a `Kysely<DB>` or `Transaction<DB>`. Queries run through
 * `withoutPlugins()`: typesql's row types describe what the driver returns, so result
 * transformers such as `CamelCasePlugin` must not rename the columns.
 */
export interface KyselyExecutor {
  withoutPlugins(): { executeQuery<R>(query: CompiledQuery<R>): Promise<QueryResult<R>> };
}

type AnyQuery = Query<unknown, readonly unknown[]>;

function run<R>(db: KyselyExecutor, text: string, values: readonly unknown[]): Promise<QueryResult<R>> {
  return db.withoutPlugins().executeQuery(CompiledQuery.raw(text, Array.from(values)) as CompiledQuery<R>);
}

/** An `Executor` for core's `q.execute()`: runs queries on a Kysely instance (or transaction), without its plugins. */
export function executor(db: KyselyExecutor): Executor {
  return async (text, values) => (await run<unknown>(db, text, values)).rows;
}

/** Run a typesql query on a Kysely instance (or transaction) and return its rows, typed from the query. */
export async function query<Q extends AnyQuery>(db: KyselyExecutor, q: Q): Promise<RowType<Q>[]> {
  const result = await run<RowType<Q>>(db, q.text, q.values);
  return result.rows;
}

/** Run a statement for its side effect and return the affected row count (`numAffectedRows`, or 0). */
export async function execute(db: KyselyExecutor, q: AnyQuery): Promise<number> {
  const result = await run<unknown>(db, q.text, q.values);
  return Number(result.numAffectedRows ?? 0n);
}
