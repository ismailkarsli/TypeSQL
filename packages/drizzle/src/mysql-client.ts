import type { Executor } from "@typesql/core";
import {
	mysqlBind,
	mysqlInline,
	mysqlPositional,
	mysqlResult,
	type SqlDriver,
} from "@typesql/core/adapter";

/**
 * A Drizzle MySQL database or transaction: `drizzle-orm/mysql2`,
 * `planetscale-serverless` or `tidb-serverless`. Its session is internal to
 * Drizzle's types, so it is read at runtime.
 */
export interface DrizzleMysqlDatabase {
	readonly _: object;
	transaction<T>(fn: (tx: DrizzleMysqlDatabase) => Promise<T>): Promise<T>;
}

type Mysql2Result = readonly [
	unknown[] | { readonly affectedRows?: number },
	unknown?,
];

interface ServerlessResult {
	readonly rows?: unknown[] | null;
	readonly rowsAffected?: number | null;
}

/** The session client: mysql2's promise pool or connection, or a serverless client. */
interface DriverClient {
	query?(text: string, values: unknown[]): Promise<Mysql2Result>;
	/** PlanetScale's and TiDB Cloud's serverless clients. */
	execute?(
		text: string,
		values: null,
		options: { readonly fullResult: true },
	): Promise<ServerlessResult>;
}

const isDriverClient = (client: unknown): client is DriverClient =>
	(typeof client === "object" || typeof client === "function") &&
	client !== null &&
	(("query" in client && typeof client.query === "function") ||
		("execute" in client && typeof client.execute === "function"));

function clientOf(db: DrizzleMysqlDatabase): DriverClient {
	const session = "session" in db ? db.session : undefined;
	const client =
		typeof session === "object" && session !== null && "client" in session
			? session.client
			: undefined;
	if (isDriverClient(client)) return client;
	throw new Error(
		"typesql: createSql(db) needs a Drizzle database on mysql2, PlanetScale or TiDB Cloud serverless (its session client has no query or execute method)",
	);
}

// Queries go to the driver itself: Drizzle's mysql2 session reads dates as
// strings for its own mapping, and the type maps describe the driver's values.
export function mysqlExecutor(db: DrizzleMysqlDatabase): Executor {
	return async (text, values) => {
		const client = clientOf(db);
		if (client.query) {
			const q = mysqlPositional(text, values, mysqlBind);
			const [result] = await client.query(q.text, q.values);
			return mysqlResult(result);
		}
		// Their own `?` substitution also replaces a `?` inside a string literal.
		const result = await client.execute!(mysqlInline(text, values), null, {
			fullResult: true,
		});
		const rows = result.rows ?? [];
		return { rows, rowCount: result.rowsAffected || rows.length };
	};
}

// Drizzle nests MySQL transactions with savepoints itself.
export const mysqlDriver: SqlDriver<DrizzleMysqlDatabase> = {
	executor: mysqlExecutor,
	transaction: (db, _depth, fn) => db.transaction(fn),
};
