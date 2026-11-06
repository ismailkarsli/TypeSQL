import { createSqlApi } from "./create-sql.js";
import type { Dialect, DialectTypes, TransactionalSqlOf } from "./dialect.js";
import { type DialectFamily, dialectFamily } from "./family.js";
import type { SqlPlugin } from "./plugin.js";
import type { Executor } from "./query.js";

export interface Transactional<Self> {
	transaction<T>(fn: (tx: Self) => Promise<T>): Promise<T>;
}

export interface SqlDriver<C> {
	executor(client: C): Executor;
	/**
	 * Run `fn` in a transaction on `client`. `depth` is how many transactions
	 * enclose the `sql`. `savepoint` names the savepoint to make instead of a
	 * transaction of its own, or is `undefined` when none encloses `client`.
	 */
	transaction<T>(
		client: C,
		depth: number,
		fn: (tx: C) => Promise<T>,
		savepoint?: string | undefined,
	): Promise<T>;
	/**
	 * Whether `client` is a transaction already, such as an ORM's that the
	 * caller passed: `sql.transaction()` on it makes a savepoint too.
	 */
	inTransaction?(client: C): boolean;
}

export function createTransactionalSql<T extends DialectTypes, DB, TM, C>(
	dialect: Dialect<T>,
	client: C | undefined,
	driver: SqlDriver<C>,
	depth = 0,
): TransactionalSqlOf<T, DB, TM> {
	const sql = createWithPlugins(dialect, client, driver, depth, []);
	// The dialect's transactional `sql` type is computed from its type
	// parameters; the runtime API cannot be checked against it.
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: see above.
	return sql as TransactionalSqlOf<T, DB, TM>;
}

/**
 * The transactional `sql` of `dialect`, which the caller picks at runtime,
 * on `client` with `driverOf` its family's driver. Its type is the
 * caller's overloads'.
 */
export const createFamilySql = <C>(
	dialect: Dialect,
	client: C | undefined,
	driverOf: (family: DialectFamily) => SqlDriver<C>,
): RuntimeSql =>
	createWithPlugins(
		dialect,
		client,
		driverOf(dialectFamily(dialect.name)),
		0,
		[],
	);

const savepointName = (depth: number): string => `typesql_${depth}`;

const ENDED =
	"typesql: this transaction has ended; run later queries on the sql that started it";

/** Rejects queries once the transaction that handed out `tx` has ended. */
function whileOpen(executor: Executor, open: () => boolean): Executor {
	const check = (): void => {
		if (!open()) throw new Error(ENDED);
	};
	const run = async (text: string, values: readonly unknown[]) => {
		check();
		return executor(text, values);
	};
	const { prepare, count } = executor;
	return Object.assign(run, {
		...(prepare && {
			prepare: (text: string) => whileOpen(prepare(text), open),
		}),
		...(count && {
			count: async (text: string, values: readonly unknown[]) => {
				check();
				return count(text, values);
			},
		}),
	});
}

/** A transactional `sql` as it is at runtime; its type is its dialect's. */
type RuntimeSql = ReturnType<typeof createSqlApi> & {
	withPlugin(plugin: SqlPlugin): RuntimeSql;
	transaction<R>(fn: (tx: RuntimeSql) => Promise<R>): Promise<R>;
};

/** `depth` is how many transactions enclose the `sql`: 0 for the client's own. */
function createWithPlugins<C>(
	dialect: Dialect,
	client: C | undefined,
	driver: SqlDriver<C>,
	depth: number,
	plugins: readonly SqlPlugin[],
	open?: () => boolean,
): RuntimeSql {
	const executor = client === undefined ? undefined : driver.executor(client);
	const sql = createSqlApi(
		dialect,
		executor && open ? whileOpen(executor, open) : executor,
		plugins,
	);
	return Object.assign(sql, {
		withPlugin: (plugin: SqlPlugin) =>
			createWithPlugins(
				dialect,
				client,
				driver,
				depth,
				[...plugins, plugin],
				open,
			),
		transaction: async <R>(fn: (tx: RuntimeSql) => Promise<R>): Promise<R> => {
			if (client === undefined)
				throw new Error(
					"typesql: no client: pass one to createSql(client) to use sql.transaction()",
				);
			if (open && !open()) throw new Error(ENDED);
			let ended = false;
			const txOpen = () => !ended && (open?.() ?? true);
			return driver.transaction(
				client,
				depth,
				async (tx) => {
					try {
						return await fn(
							createWithPlugins(
								dialect,
								tx,
								driver,
								depth + 1,
								plugins,
								txOpen,
							),
						);
					} finally {
						ended = true;
					}
				},
				depth > 0 || driver.inTransaction?.(client)
					? savepointName(depth)
					: undefined,
			);
		},
	});
}

export async function runTransaction<T, Done = unknown>(
	run: (statement: string) => PromiseLike<Done>,
	fn: () => Promise<T>,
	options: {
		readonly savepoint?: string | undefined;
		readonly onRollbackError?: (cause: unknown) => void;
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

/**
 * Run `fn` in a transaction on `conn`, a connection checked out of a pool,
 * and give it back with `release`: `broken` is set when ROLLBACK failed, and
 * the connection may still be in the transaction, so the next caller must
 * not get it.
 */
export async function pooledTransaction<C, T, Done>(
	conn: C,
	run: (statement: string) => PromiseLike<Done>,
	release: (broken: Error | undefined) => void | Promise<void>,
	fn: (conn: C) => Promise<T>,
): Promise<T> {
	let broken: Error | undefined;
	try {
		return await runTransaction(run, () => fn(conn), {
			onRollbackError: (cause) => {
				broken = cause instanceof Error ? cause : new Error(String(cause));
			},
		});
	} finally {
		await release(broken);
	}
}

const queues = new WeakMap<WeakKey, Promise<unknown>>();

/**
 * Run `fn` in a transaction with `run`'s statements, one top-level
 * transaction at a time on `client`: for drivers whose connection is one
 * object that every caller shares, such as SQLite's. Below depth 0 it makes
 * a savepoint in the transaction under way.
 */
export function serialTransaction<T>(
	client: WeakKey,
	depth: number,
	run: (statement: string) => Promise<void>,
	fn: () => Promise<T>,
): Promise<T> {
	if (depth > 0)
		return runTransaction(run, fn, { savepoint: savepointName(depth) });
	const current = (queues.get(client) ?? Promise.resolve()).then(() =>
		runTransaction(run, fn),
	);
	queues.set(
		client,
		current.catch(() => undefined),
	);
	return current;
}
