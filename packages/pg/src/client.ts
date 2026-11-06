import { createHash } from "node:crypto";
import type { Executor } from "@typesql/core";
import {
	type PgField,
	parsePgUserArrays,
	pgResult,
	pooledTransaction,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";

export interface PgResult {
	readonly rows: unknown[];
	readonly rowCount: number | null;
	readonly fields?: readonly PgField[];
}

export interface PgQueryable {
	query(text: string | PgQueryConfig, values?: unknown[]): Promise<PgResult>;
}

export interface PgQueryConfig {
	readonly name: string;
	readonly text: string;
	readonly values: unknown[];
}

export interface PgTransactionClient extends PgQueryable {
	release(err?: Error | boolean): void;
}

type ErrorListener = (err: Error) => void;

// pg's clients are EventEmitters.
const canOn = (
	conn: PgTransactionClient,
): conn is PgTransactionClient & {
	on(event: "error", listener: ErrorListener): void;
} => "on" in conn && typeof conn.on === "function";

const canOff = (
	conn: PgTransactionClient,
): conn is PgTransactionClient & {
	off(event: "error", listener: ErrorListener): void;
} => "off" in conn && typeof conn.off === "function";

export interface PgPoolLike<
	C extends PgTransactionClient = PgTransactionClient,
> {
	connect(): Promise<C>;
}

// A pool's checked-out clients share the pool's cache of user-defined array types.
const pools = new WeakMap<PgQueryable, object>();

/** A result's rows, with arrays of user-defined types parsed; a script's last statement stands for it. */
function rowsOf(
	client: PgQueryable,
	result: PgResult,
): Promise<{ rows: unknown[]; rowCount: number | null }> {
	const { rows, rowCount, fields }: PgResult = pgResult(result) ?? {
		rows: [],
		rowCount: 0,
	};
	return parsePgUserArrays(
		pools.get(client) ?? client,
		(text, values) => client.query(text, values),
		fields,
		rows,
	).then((rows) => ({ rows, rowCount }));
}

export function executor(client: PgQueryable): Executor {
	return Object.assign(
		async (text: string, values: readonly unknown[]) =>
			rowsOf(client, await client.query(text, Array.from(values))),
		{
			prepare: (text: string): Executor => {
				const name = `typesql_${createHash("sha256").update(text).digest("hex").slice(0, 48)}`;
				return async (text, values) =>
					rowsOf(
						client,
						await client.query({ name, text, values: Array.from(values) }),
					);
			},
		},
	);
}

function isPool(client: PgQueryable): client is PgQueryable & PgPoolLike {
	return (
		"connect" in client &&
		typeof client.connect === "function" &&
		!isConnection(client)
	);
}

function isConnection(client: PgQueryable): boolean {
	return "release" in client || "processID" in client;
}

const on = (c: PgQueryable) => (statement: string) => c.query(statement);

async function inPoolTransaction<C extends PgTransactionClient, T>(
	pool: PgPoolLike<C>,
	fn: (conn: C) => Promise<T>,
): Promise<T> {
	const conn = await pool.connect();
	let lost: Error | undefined;
	// A checked-out pg client has no pool listener, so an unhandled 'error'
	// (a dropped connection) would crash the process. The pending query rejects.
	const onError: ErrorListener = (err) => {
		lost ??= err;
	};
	if (canOn(conn)) conn.on("error", onError);
	pools.set(conn, pool);
	return pooledTransaction(
		conn,
		on(conn),
		(broken) => {
			if (canOff(conn)) conn.off("error", onError);
			conn.release(broken ?? lost);
		},
		fn,
	);
}

function transaction<T>(
	client: PgQueryable,
	_depth: number,
	fn: (tx: PgQueryable) => Promise<T>,
	savepoint: string | undefined,
): Promise<T> {
	if (savepoint === undefined && isPool(client))
		return inPoolTransaction(client, fn);
	if (savepoint === undefined && !isConnection(client)) {
		return Promise.reject(
			new Error(
				"typesql: sql.transaction() needs a pg Pool, Client or PoolClient, so that BEGIN and COMMIT reach one connection",
			),
		);
	}
	return runTransaction(on(client), () => fn(client), { savepoint });
}

export const driver: SqlDriver<PgQueryable> = { executor, transaction };
