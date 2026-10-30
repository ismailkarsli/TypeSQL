import { createDialectSql } from "./create-sql.js";
import type { Dialect, DialectTypes, TransactionalSqlOf } from "./dialect.js";
import type { SqlPlugin } from "./plugin.js";
import type { Executor } from "./query.js";

export interface Transactional<Self> {
	transaction<T>(fn: (tx: Self) => Promise<T>): Promise<T>;
}

export interface SqlDriver<C> {
	executor(client: C): Executor;
	transaction<T>(
		client: C,
		depth: number,
		fn: (tx: C) => Promise<T>,
	): Promise<T>;
}

export function createTransactionalSql<T extends DialectTypes, DB, TM, C>(
	dialect: Dialect<T>,
	client: C | undefined,
	driver: SqlDriver<C>,
	depth = 0,
): TransactionalSqlOf<T, DB, TM> {
	return createWithPlugins<T, DB, TM, C>(dialect, client, driver, depth, []);
}

function createWithPlugins<T extends DialectTypes, DB, TM, C>(
	dialect: Dialect<T>,
	client: C | undefined,
	driver: SqlDriver<C>,
	depth = 0,
	plugins: readonly SqlPlugin[] = [],
): TransactionalSqlOf<T, DB, TM> {
	const sql = createDialectSql<T, DB, TM>(
		dialect,
		client === undefined ? undefined : driver.executor(client),
		plugins,
	) as object;
	return Object.assign(sql, {
		withPlugin: (plugin: SqlPlugin) =>
			createWithPlugins<T, DB, TM, C>(dialect, client, driver, depth, [
				...plugins,
				plugin,
			]),
		transaction: async <R>(
			fn: (tx: TransactionalSqlOf<T, DB, TM>) => Promise<R>,
		): Promise<R> => {
			if (client === undefined)
				throw new Error(
					"typesql: no client: pass one to createSql(client) to use sql.transaction()",
				);
			return driver.transaction(client, depth, (tx) =>
				fn(
					createWithPlugins<T, DB, TM, C>(
						dialect,
						tx,
						driver,
						depth + 1,
						plugins,
					),
				),
			);
		},
	}) as TransactionalSqlOf<T, DB, TM>;
}

export async function runTransaction<T>(
	run: (statement: string) => PromiseLike<unknown>,
	fn: () => Promise<T>,
	options: {
		readonly savepoint?: string;
		readonly onRollbackError?: (err: unknown) => void;
	} = {},
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
