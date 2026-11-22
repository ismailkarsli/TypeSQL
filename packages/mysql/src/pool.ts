import type { Executor, ExecutorResult } from "@typesql/core";
import {
	exclusiveTransaction,
	type MySqlValue,
	mysqlBind,
	mysqlPositional,
	pooledTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";

/** How mysql2 or the mariadb connector runs one statement on a client. */
export interface Runner<C> {
	/** Text protocol: the driver escapes `values` into the statement. */
	query(client: C, text: string, values: MySqlValue[]): Promise<ExecutorResult>;
	/** Binary protocol: a server-side prepared statement the driver caches per connection. */
	execute(
		client: C,
		text: string,
		values: MySqlValue[],
	): Promise<ExecutorResult>;
	/** Text protocol, rows as they arrive; `undefined` when `conn`, a connection, cannot stream. */
	stream?(conn: C, text: string, values: MySqlValue[]): RowStream | undefined;
}

/** What `stream()` uses of a driver's Node.js Readable of rows. */
export interface RowStream {
	iterator(options: {
		readonly destroyOnReturn: boolean;
	}): AsyncIterable<unknown>;
	destroy(): void;
	/** The mariadb connector's: skips the rest of the rows, so that the connection is free again. */
	close?(): void;
}

interface PoolLike<C> {
	getConnection(): Promise<C>;
}

interface Checkout {
	release(): void | Promise<void>;
	destroy?(): void | Promise<void>;
}

// Statements go through the text protocol, where the driver escapes each value
// into the SQL: every statement works (DDL, `LIMIT $1`, statements MySQL cannot
// prepare) and nothing stays allocated on the server. sql.prepare() uses the
// binary protocol instead: the driver prepares the statement once per
// connection and reuses it. There, mysql2 before 3.24 sends every JS number as
// a DOUBLE, which MySQL 8.0.22+ rejects in `LIMIT ?` ("Incorrect arguments to
// mysqld_stmt_execute"); 3.24 types integers from the statement's parameters.
export function executor<C>(runner: Runner<C>, client: C): Executor {
	const run =
		(send: Runner<C>["query"], text?: string) =>
		async (given: string, values: readonly unknown[]) => {
			const p = mysqlPositional(text ?? given, values);
			return send(client, p.text, p.values.map(mysqlBind));
		};
	const stream = (
		text: string,
		values: readonly unknown[],
		batchSize: number,
	) => streamRows(runner, client, mysqlPositional(text, values), batchSize);
	return Object.assign(run(runner.query), {
		// A stream uses the text protocol, prepared or not.
		prepare: (text: string): Executor =>
			Object.assign(run(runner.execute, text), { stream }),
		stream,
	});
}

/** Rows of `p`, on a connection checked out of `client` when it is a pool. */
async function* streamRows<C>(
	runner: Runner<C>,
	client: C,
	p: { readonly text: string; readonly values: readonly unknown[] },
	batchSize: number,
): AsyncGenerator<unknown[]> {
	const open = (conn: C) =>
		runner.stream?.(conn, p.text, p.values.map(mysqlBind)) ??
		fail("typesql: this MySQL client cannot stream rows");
	if (!isPool(client)) return yield* batches(open(client), batchSize);
	const conn = await client.getConnection();
	if (!isCheckout(conn))
		throw new Error(
			"typesql: the pool's connection has no release(); stream() cannot return it to the pool",
		);
	try {
		yield* batches(open(conn), batchSize);
	} finally {
		await conn.release();
	}
}

const fail = (message: string): never => {
	throw new Error(message);
};

// mysql2 streams the OK packet of a statement without rows.
const isPacket = (row: unknown): row is { readonly affectedRows: unknown } =>
	typeof row === "object" &&
	row !== null &&
	"affectedRows" in row &&
	"insertId" in row;

async function* batches(
	rows: RowStream,
	batchSize: number,
): AsyncGenerator<unknown[]> {
	let ended = false;
	try {
		let batch: unknown[] = [];
		for await (const row of rows.iterator({ destroyOnReturn: false })) {
			if (isPacket(row)) continue;
			batch.push(row);
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		ended = true;
		if (batch.length) yield batch;
	} finally {
		// Stopped early: skip the rest of the rows; mysql2 does so on destroy().
		if (!ended) {
			rows.close?.();
			rows.destroy();
		}
	}
}

const isPool = <C>(client: C): client is C & PoolLike<C> =>
	typeof client === "object" &&
	client !== null &&
	"getConnection" in client &&
	typeof client.getConnection === "function" &&
	!("release" in client);

const isConnection = <C>(client: C): boolean =>
	typeof client === "object" &&
	client !== null &&
	("release" in client ||
		("beginTransaction" in client &&
			typeof client.beginTransaction === "function"));

/** What mysql2 and the mariadb connector have on a connection, not on a pool. */
interface NativeTransactions {
	beginTransaction(): Promise<void>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
}

const hasTransactions = <C>(conn: C): conn is C & NativeTransactions =>
	typeof conn === "object" &&
	conn !== null &&
	"beginTransaction" in conn &&
	typeof conn.beginTransaction === "function" &&
	"commit" in conn &&
	typeof conn.commit === "function" &&
	"rollback" in conn &&
	typeof conn.rollback === "function";

const isCheckout = <C>(conn: C): conn is C & Checkout =>
	typeof conn === "object" &&
	conn !== null &&
	"release" in conn &&
	typeof conn.release === "function";

export function driver<C extends object>(
	runner: Runner<C>,
	name: string,
): SqlDriver<C> {
	// The driver's own methods where it has them; savepoints are statements.
	const on =
		(c: C) =>
		(statement: string): Promise<ExecutorResult | void> => {
			if (hasTransactions(c)) {
				if (statement === "BEGIN") return c.beginTransaction();
				if (statement === "COMMIT") return c.commit();
				if (statement === "ROLLBACK") return c.rollback();
			}
			return runner.query(c, statement, []);
		};

	async function inPoolTransaction<T>(
		pool: PoolLike<C>,
		fn: (conn: C) => Promise<T>,
	): Promise<T> {
		const conn = await pool.getConnection();
		if (!isCheckout(conn))
			throw new Error(
				`typesql: the ${name} pool's connection has no release(); sql.transaction() cannot return it to the pool`,
			);
		// A connection whose ROLLBACK failed may still be in the transaction:
		// close it instead of handing it to the next caller.
		return pooledTransaction(
			conn,
			on(conn),
			(broken) =>
				broken !== undefined && conn.destroy ? conn.destroy() : conn.release(),
			fn,
		);
	}

	function transaction<T>(
		client: C,
		depth: number,
		fn: (tx: C) => Promise<T>,
		savepoint: string | undefined,
	): Promise<T> {
		if (savepoint === undefined && isPool(client))
			return inPoolTransaction(client, fn);
		if (savepoint === undefined && !isConnection(client))
			return Promise.reject(
				new Error(
					`typesql: sql.transaction() needs a ${name} Pool, PoolConnection or Connection, so that BEGIN and COMMIT reach one connection`,
				),
			);
		return exclusiveTransaction(client, depth, on(client), () => fn(client));
	}

	return { executor: (client) => executor(runner, client), transaction };
}
