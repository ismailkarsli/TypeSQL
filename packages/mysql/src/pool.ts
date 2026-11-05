import type { Executor, ExecutorResult } from "@typesql/core";
import {
	mysqlPositional,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";

/**
 * What mysql2 and the mariadb connector resolve a statement to: its rows, or
 * the OK packet of a statement without rows.
 */
export type DriverResult =
	| readonly unknown[]
	| { readonly affectedRows?: number | bigint };

/** A value as mysql2 and the mariadb connector bind it. */
export type MySqlValue =
	| string
	| number
	| bigint
	| boolean
	| Date
	| Buffer
	| null;

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
}

interface PoolLike<C> {
	getConnection(): Promise<C>;
}

interface Checkout {
	release(): void | Promise<void>;
	destroy?(): void | Promise<void>;
}

/**
 * The values of a statement as the drivers bind them: `sql.json(…)` is JSON
 * text already, `undefined` is `NULL`, and a plain `Uint8Array` becomes a
 * `Buffer`, which both drivers send as binary.
 */
function bind(values: readonly unknown[]): MySqlValue[] {
	return values.map((v): MySqlValue => {
		if (v === undefined || v === null) return null;
		if (Buffer.isBuffer(v)) return v;
		if (v instanceof Uint8Array)
			return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
		if (v instanceof Date) return v;
		switch (typeof v) {
			case "string":
			case "number":
			case "bigint":
			case "boolean":
				return v;
		}
		throw new TypeError(
			`typesql: cannot bind ${Object.prototype.toString.call(v)} as a MySQL value; use sql.json() for JSON`,
		);
	});
}

/** Rows of a statement that returns them, else the affected row count. */
export function resultOf(result: DriverResult): ExecutorResult {
	if (Array.isArray(result)) return { rows: result, rowCount: result.length };
	const affected = "affectedRows" in result ? result.affectedRows : undefined;
	return { rows: [], rowCount: affected === undefined ? 0 : Number(affected) };
}

// Statements go through the text protocol, where the driver escapes each value
// into the SQL: every statement works (DDL, `LIMIT $1`, statements MySQL cannot
// prepare) and nothing stays allocated on the server. sql.prepare() uses the
// binary protocol instead: the driver prepares the statement once per
// connection and reuses it. There, mysql2 before 3.24 sends every JS number as
// a DOUBLE, which MySQL 8.0.22+ rejects in `LIMIT ?` ("Incorrect arguments to
// mysqld_stmt_execute"); 3.24 types integers from the statement's parameters.
export function executor<C>(runner: Runner<C>, client: C): Executor {
	return Object.assign(
		async (text: string, values: readonly unknown[]) => {
			const p = mysqlPositional(text, values);
			return runner.query(client, p.text, bind(p.values));
		},
		{
			prepare: (text: string): Executor => {
				return async (_text, values) => {
					const p = mysqlPositional(text, values);
					return runner.execute(client, p.text, bind(p.values));
				};
			},
		},
	);
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

const isCheckout = <C>(conn: C): conn is C & Checkout =>
	typeof conn === "object" &&
	conn !== null &&
	"release" in conn &&
	typeof conn.release === "function";

export function driver<C>(runner: Runner<C>, name: string): SqlDriver<C> {
	const on = (c: C) => (statement: string) => runner.query(c, statement, []);

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
		let broken = false;
		try {
			return await runTransaction(on(conn), () => fn(conn), {
				onRollbackError: () => {
					broken = true;
				},
			});
		} finally {
			if (broken && conn.destroy) await conn.destroy();
			else await conn.release();
		}
	}

	function transaction<T>(
		client: C,
		depth: number,
		fn: (tx: C) => Promise<T>,
	): Promise<T> {
		if (depth > 0)
			return runTransaction(on(client), () => fn(client), {
				savepoint: `typesql_${depth}`,
			});
		if (isPool(client)) return inPoolTransaction(client, fn);
		if (!isConnection(client))
			return Promise.reject(
				new Error(
					`typesql: sql.transaction() needs a ${name} Pool, PoolConnection or Connection, so that BEGIN and COMMIT reach one connection`,
				),
			);
		return runTransaction(on(client), () => fn(client));
	}

	return { executor: (client) => executor(runner, client), transaction };
}
