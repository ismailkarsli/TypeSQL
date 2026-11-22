import { createHash } from "node:crypto";
import type { Executor } from "@typesql/core";
import {
	exclusiveTransaction,
	type PgField,
	parsePgUserArrays,
	pgResult,
	pooledTransaction,
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

// A pool's checked-out clients share the pool's cache of user-defined array
// types, and look types up on the pool while a cursor holds them.
const pools = new WeakMap<PgQueryable, PgQueryable>();

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

/** What `stream()` uses of a pg-cursor `Cursor`. */
interface PgCursor {
	read(
		rows: number,
		cb: (
			err: Error | undefined,
			rows: unknown[],
			result?: { readonly fields?: readonly PgField[] },
		) => void,
	): void;
	close(): Promise<void>;
}

type PgCursorClass = new (text: string, values: unknown[]) => PgCursor;

// A variable, so that bundlers leave the optional peer dependency alone.
const PG_CURSOR = "pg-cursor";
let cursorClass: Promise<PgCursorClass> | undefined;

const isCursorModule = (
	module: unknown,
): module is { readonly default: PgCursorClass } =>
	typeof module === "object" &&
	module !== null &&
	"default" in module &&
	typeof module.default === "function";

async function importCursor(): Promise<PgCursorClass> {
	let module: unknown;
	try {
		module = await import(
			/* webpackIgnore: true */ /* @vite-ignore */ PG_CURSOR
		);
	} catch (cause) {
		cursorClass = undefined;
		throw new Error(
			"typesql: stream() on pg needs the pg-cursor package; install it next to pg",
			{ cause },
		);
	}
	if (!isCursorModule(module))
		throw new Error("typesql: pg-cursor is not the expected package");
	return module.default;
}

const loadCursor = (): Promise<PgCursorClass> =>
	(cursorClass ??= importCursor());

// pg's client.query() runs a cursor (a Submittable) and returns it.
const canSubmit = (
	client: PgQueryable,
): client is PgQueryable & { query(cursor: PgCursor): PgCursor } =>
	typeof client.query === "function";

const read = (
	cursor: PgCursor,
	rows: number,
): Promise<{ rows: unknown[]; fields: readonly PgField[] | undefined }> =>
	new Promise((resolve, reject) =>
		cursor.read(rows, (err, rows, result) =>
			err ? reject(err) : resolve({ rows, fields: result?.fields }),
		),
	);

/** Rows of `text` from a cursor on `conn`, one connection. */
async function* cursorRows(
	conn: PgQueryable,
	text: string,
	values: readonly unknown[],
	batchSize: number,
): AsyncGenerator<unknown[]> {
	const Cursor = await loadCursor();
	if (!canSubmit(conn))
		throw new Error("typesql: this pg client cannot run a cursor");
	const pool = pools.get(conn);
	const cursor = conn.query(new Cursor(text, Array.from(values)));
	try {
		for (;;) {
			const { rows, fields } = await read(cursor, batchSize);
			if (rows.length === 0) return;
			// The cursor holds `conn` until it closes: look types up on its pool.
			yield await parsePgUserArrays(
				pool ?? conn,
				pool && ((text, values) => pool.query(text, values)),
				fields,
				rows,
			);
		}
	} finally {
		await cursor.close();
	}
}

/** Rows of `text`, on a client checked out of `client` when it is a pool. */
async function* streamRows(
	client: PgQueryable,
	text: string,
	values: readonly unknown[],
	batchSize: number,
): AsyncGenerator<unknown[]> {
	if (!isPool(client))
		return yield* cursorRows(client, text, values, batchSize);
	const conn = await client.connect();
	let lost: Error | undefined;
	const onError: ErrorListener = (err) => {
		lost ??= err;
	};
	if (canOn(conn)) conn.on("error", onError);
	pools.set(conn, client);
	try {
		yield* cursorRows(conn, text, values, batchSize);
	} catch (err) {
		// As pool.query() does, a client whose statement failed is closed.
		lost ??= err instanceof Error ? err : new Error(String(err));
		throw err;
	} finally {
		if (canOff(conn)) conn.off("error", onError);
		conn.release(lost);
	}
}

export function executor(client: PgQueryable): Executor {
	const stream = (
		text: string,
		values: readonly unknown[],
		batchSize: number,
	) => streamRows(client, text, values, batchSize);
	return Object.assign(
		async (text: string, values: readonly unknown[]) =>
			rowsOf(client, await client.query(text, Array.from(values))),
		{
			prepare: (text: string): Executor => {
				const name = `typesql_${createHash("sha256").update(text).digest("hex").slice(0, 48)}`;
				return Object.assign(
					async (text: string, values: readonly unknown[]) =>
						rowsOf(
							client,
							await client.query({ name, text, values: Array.from(values) }),
						),
					// A cursor's statement is unnamed.
					{ stream },
				);
			},
			stream,
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
	pool: PgQueryable & PgPoolLike<C>,
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
	depth: number,
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
	return exclusiveTransaction(client, depth, on(client), () => fn(client));
}

export const driver: SqlDriver<PgQueryable> = { executor, transaction };
