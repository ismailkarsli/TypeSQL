import { createSql, type Sql } from "./create-sql.js";
import type { Executor } from "./query.js";
import type { RowKeys, SqlOptions } from "./row-keys.js";

export interface TransactionalSql<DB, TM, Keys extends RowKeys = "preserve">
	extends Sql<DB, TM, Keys> {
	transaction<T>(
		fn: (tx: TransactionalSql<DB, TM, Keys>) => Promise<T>,
	): Promise<T>;
}

export interface SqlDriver<C> {
	executor(client: C): Executor;
	transaction<T>(
		client: C,
		depth: number,
		fn: (tx: C) => Promise<T>,
	): Promise<T>;
}

export function createTransactionalSql<DB, TM, C>(
	client: C | undefined,
	driver: SqlDriver<C>,
	options?: SqlOptions,
	depth = 0,
): TransactionalSql<DB, TM, RowKeys> {
	const sql = createSql<DB, TM>(
		client === undefined ? undefined : driver.executor(client),
		options as { readonly rowKeys: "camelCase" },
	);
	return Object.assign(sql, {
		transaction: async <T>(
			fn: (tx: TransactionalSql<DB, TM, RowKeys>) => Promise<T>,
		): Promise<T> => {
			if (client === undefined)
				throw new Error(
					"typesql: no client: pass one to createSql(client) to use sql.transaction()",
				);
			return driver.transaction(client, depth, (tx) =>
				fn(createTransactionalSql<DB, TM, C>(tx, driver, options, depth + 1)),
			);
		},
	}) as unknown as TransactionalSql<DB, TM, RowKeys>;
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
