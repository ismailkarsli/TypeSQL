import type { Executor } from "@typesql/core";
import {
	positional,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
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

type Compile = (
	text: string,
	values: readonly unknown[],
) => { readonly text: string; readonly values: unknown[] };

const numbered: Compile = (text, values) => ({
	text,
	values: Array.from(values),
});

function run<R>(
	db: KyselyExecutor,
	text: string,
	values: readonly unknown[],
	compile: Compile = numbered,
): Promise<QueryResult<R>> {
	const q = compile(text, values);
	return db
		.withoutPlugins()
		.executeQuery(CompiledQuery.raw(q.text, q.values) as CompiledQuery<R>);
}

function rowCount(result: QueryResult<unknown>): number {
	return result.numAffectedRows === undefined
		? result.rows.length
		: Number(result.numAffectedRows);
}

export function executor(
	db: KyselyExecutor,
	options: { readonly dialect?: "postgres" | "sqlite" } = {},
): Executor {
	const compile = options.dialect === "sqlite" ? positional : numbered;
	return async (text, values) => {
		const result = await run<unknown>(db, text, values, compile);
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

export const driver: SqlDriver<KyselyExecutor> = {
	executor: (db) => executor(db),
	transaction,
};

export const sqliteDriver: SqlDriver<KyselyExecutor> = {
	executor: (db) => executor(db, { dialect: "sqlite" }),
	transaction,
};
