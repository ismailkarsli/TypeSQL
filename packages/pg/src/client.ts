import { createHash } from "node:crypto";
import type { Executor } from "@typesql/core";
import {
	type PgField,
	parsePgUserArrays,
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

function rowsOf(
	client: PgQueryable,
	{ rows, rowCount, fields }: PgResult,
): Promise<{ rows: unknown[]; rowCount: number | null }> {
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
	let releaseWith: Error | undefined;
	const toError = (cause: unknown) =>
		cause instanceof Error ? cause : new Error(String(cause));
	// A checked-out pg client has no pool listener, so an unhandled 'error'
	// (a dropped connection) would crash the process. The pending query rejects.
	const onError: ErrorListener = (err) => {
		releaseWith ??= toError(err);
	};
	if (canOn(conn)) conn.on("error", onError);
	pools.set(conn, pool);
	try {
		return await runTransaction(on(conn), () => fn(conn), {
			onRollbackError: (err) => {
				releaseWith = toError(err);
			},
		});
	} finally {
		if (canOff(conn)) conn.off("error", onError);
		conn.release(releaseWith);
	}
}

function transaction<T>(
	client: PgQueryable,
	depth: number,
	fn: (tx: PgQueryable) => Promise<T>,
): Promise<T> {
	if (depth > 0)
		return runTransaction(on(client), () => fn(client), {
			savepoint: `typesql_${depth}`,
		});
	if (isPool(client)) return inPoolTransaction(client, fn);
	if (!isConnection(client)) {
		return Promise.reject(
			new Error(
				"typesql: sql.transaction() needs a pg Pool, Client or PoolClient, so that BEGIN and COMMIT reach one connection",
			),
		);
	}
	return runTransaction(on(client), () => fn(client));
}

export const driver: SqlDriver<PgQueryable> = { executor, transaction };
