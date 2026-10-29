import type { Executor } from "@typesql/core";
import { runTransaction, type SqlDriver } from "@typesql/core/adapter";
import { CompiledQuery, type QueryResult } from "kysely";

export interface KyselyExecutor {
	withoutPlugins(): {
		executeQuery<R>(query: CompiledQuery<R>): Promise<QueryResult<R>>;
	};
	transaction(): {
		execute<T>(fn: (trx: KyselyExecutor) => Promise<T>): Promise<T>;
	};
	readonly isTransaction: boolean;
}

function run<R>(
	db: KyselyExecutor,
	text: string,
	values: readonly unknown[],
): Promise<QueryResult<R>> {
	return db
		.withoutPlugins()
		.executeQuery(
			CompiledQuery.raw(text, Array.from(values)) as CompiledQuery<R>,
		);
}

function rowCount(result: QueryResult<unknown>): number {
	return result.numAffectedRows === undefined
		? result.rows.length
		: Number(result.numAffectedRows);
}

export function executor(db: KyselyExecutor): Executor {
	return async (text, values) => {
		const result = await run<unknown>(db, text, values);
		return { rows: result.rows, rowCount: rowCount(result) };
	};
}

function transaction<T>(
	db: KyselyExecutor,
	depth: number,
	fn: (trx: KyselyExecutor) => Promise<T>,
): Promise<T> {
	if (!db.isTransaction) return db.transaction().execute(fn);
	return runTransaction(
		(statement) => run(db, statement, []),
		() => fn(db),
		{ savepoint: `typesql_${depth + 1}` },
	);
}

export const driver: SqlDriver<KyselyExecutor> = { executor, transaction };
