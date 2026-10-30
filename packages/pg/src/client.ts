import { createHash } from "node:crypto";
import type { Executor } from "@typesql/core";
import { runTransaction, type SqlDriver } from "@typesql/core/adapter";

export interface PgResult {
	readonly rows: unknown[];
	readonly rowCount: number | null;
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

interface ErrorEvents {
	on?(event: "error", listener: (err: unknown) => void): unknown;
	off?(event: "error", listener: (err: unknown) => void): unknown;
}

export interface PgPoolLike<
	C extends PgTransactionClient = PgTransactionClient,
> {
	connect(): Promise<C>;
}

export function executor(client: PgQueryable): Executor {
	return Object.assign(
		async (text: string, values: readonly unknown[]) => {
			const { rows, rowCount } = await client.query(text, Array.from(values));
			return { rows, rowCount };
		},
		{
			prepare: (text: string): Executor => {
				const name = `typesql_${createHash("sha256").update(text).digest("hex").slice(0, 48)}`;
				return async (text, values) => {
					const { rows, rowCount } = await client.query({
						name,
						text,
						values: Array.from(values),
					});
					return { rows, rowCount };
				};
			},
		},
	);
}

function isPool(client: PgQueryable): client is PgQueryable & PgPoolLike {
	return (
		typeof (client as Partial<PgPoolLike>).connect === "function" &&
		!("release" in client) &&
		!("processID" in client)
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
	const toError = (err: unknown) =>
		err instanceof Error ? err : new Error(String(err));
	// A checked-out pg client has no pool listener, so an unhandled 'error'
	// (a dropped connection) would crash the process. The pending query rejects.
	const onError = (err: unknown) => {
		releaseWith ??= toError(err);
	};
	const events = conn as ErrorEvents;
	events.on?.("error", onError);
	try {
		return await runTransaction(on(conn), () => fn(conn), {
			onRollbackError: (err) => {
				releaseWith = toError(err);
			},
		});
	} finally {
		events.off?.("error", onError);
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

export interface MigrationSource {
	readonly statements: readonly string[];
}

export async function migrate<C extends PgTransactionClient>(
	pool: PgPoolLike<C>,
	m: MigrationSource,
): Promise<void> {
	await inPoolTransaction(pool, async (client) => {
		for (const statement of m.statements) await client.query(statement);
	});
}
