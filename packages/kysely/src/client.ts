import type { Executor } from "@typesql/core";
import {
	positional,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import { CompiledQuery, type QueryResult, SqliteAdapter } from "kysely";

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

/**
 * Whether `db` runs on SQLite: its dialect's adapter is Kysely's SQLite one,
 * from this copy of Kysely or by name from another.
 */
function isSqlite(db: KyselyExecutor): boolean {
	const { getExecutor } = db as { getExecutor?: () => { adapter?: unknown } };
	if (typeof getExecutor !== "function") return false;
	const { adapter } = getExecutor.call(db);
	return (
		adapter instanceof SqliteAdapter ||
		(adapter as { constructor?: { name?: unknown } } | undefined)?.constructor
			?.name === "SqliteAdapter"
	);
}

/**
 * An executor on `db`. SQLite's placeholders are used when `dialect` is
 * `"sqlite"`, or, without `dialect`, when `db` runs on SQLite.
 */
export function executor(
	db: KyselyExecutor,
	options: { readonly dialect?: "postgres" | "sqlite" } = {},
): Executor {
	const sqlite =
		options.dialect === undefined ? isSqlite(db) : options.dialect === "sqlite";
	const compile = sqlite ? positional : numbered;
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
