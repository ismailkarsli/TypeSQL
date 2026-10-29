import { createDialectSql } from "./create-sql.js";
import type { Dialect, DialectTypes, TransactionalSqlOf } from "./dialect.js";
import type { Executor } from "./query.js";
import type { RowKeys, SqlOptions } from "./row-keys.js";

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
	options?: SqlOptions,
	depth = 0,
): TransactionalSqlOf<T, DB, TM, RowKeys> {
	const sql = createDialectSql<T, DB, TM>(
		dialect,
		client === undefined ? undefined : driver.executor(client),
		options as { readonly rowKeys: "camelCase" },
	) as object;
	return Object.assign(sql, {
		transaction: async <R>(
			fn: (tx: TransactionalSqlOf<T, DB, TM, RowKeys>) => Promise<R>,
		): Promise<R> => {
			if (client === undefined)
				throw new Error(
					"typesql: no client: pass one to createSql(client) to use sql.transaction()",
				);
			return driver.transaction(client, depth, (tx) =>
				fn(
					createTransactionalSql<T, DB, TM, C>(
						dialect,
						tx,
						driver,
						options,
						depth + 1,
					),
				),
			);
		},
	}) as TransactionalSqlOf<T, DB, TM, RowKeys>;
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
