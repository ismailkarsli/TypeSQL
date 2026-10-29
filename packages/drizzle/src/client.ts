import type { Executor } from "@typesql/core";
import type { SqlDriver } from "@typesql/core/adapter";

export interface DrizzleDatabase {
	readonly _: { readonly session: object };
	transaction<T>(fn: (tx: DrizzleDatabase) => Promise<T>): Promise<T>;
}

interface DriverClient {
	query?(text: string, values: unknown[]): Promise<unknown>;
	unsafe?(text: string, values: unknown[]): PromiseLike<unknown>;
}

function clientOf(db: DrizzleDatabase): DriverClient {
	const client = (db._.session as { readonly client?: DriverClient }).client;
	if (
		client &&
		(typeof client.unsafe === "function" || typeof client.query === "function")
	)
		return client;
	throw new Error(
		"typesql: createSql(db) needs a Drizzle database on node-postgres or postgres.js (its session client has no query or unsafe method)",
	);
}

export function executor(db: DrizzleDatabase): Executor {
	return async (text, values) => {
		const client = clientOf(db);
		if (client.unsafe) {
			const result = (await client.unsafe(
				text,
				Array.from(values),
			)) as unknown[] & { readonly count?: number | null };
			return { rows: Array.from(result), rowCount: result.count ?? null };
		}
		const result = (await client.query!(text, Array.from(values))) as {
			rows: unknown[];
			rowCount?: number | null;
		};
		return { rows: result.rows, rowCount: result.rowCount ?? null };
	};
}

function transaction<T>(
	db: DrizzleDatabase,
	_depth: number,
	fn: (tx: DrizzleDatabase) => Promise<T>,
): Promise<T> {
	return db.transaction(fn);
}

export const driver: SqlDriver<DrizzleDatabase> = { executor, transaction };
