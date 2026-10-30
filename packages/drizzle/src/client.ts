import type { Executor } from "@typesql/core";
import {
	type PgField,
	parsePgUserArrays,
	type SqlDriver,
} from "@typesql/core/adapter";

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

// Drizzle replaces postgres.js's json, jsonb and date serializers and its date
// parsers with identity functions on the shared client. Serialize those values
// here, and parse dates back, so values match the default type map.
const DATES = new Set([1082, 1114, 1184]);
const DATE_ARRAYS = new Set([1182, 1115, 1185]);

function postgresJsParam(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		ArrayBuffer.isView(value)
	)
		return value;
	return JSON.stringify(value);
}

const toDate = (value: unknown): unknown =>
	typeof value === "string" ? new Date(value) : value;

/** A one-dimensional date array literal, e.g. `{"2024-01-01 10:00:00+00",NULL}`. */
function toDates(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(toDate);
	if (typeof value !== "string" || !value.startsWith("{") || value[1] === "{")
		return value;
	if (value === "{}") return [];
	return value
		.slice(1, -1)
		.split(",")
		.map((item) =>
			item === "NULL" ? null : new Date(item.replace(/^"|"$/g, "")),
		);
}

type PostgresJsResult = unknown[] & {
	readonly count?: number | null;
	readonly columns?: readonly {
		readonly name: string;
		readonly type: number;
	}[];
};

function postgresJsRows(result: PostgresJsResult): unknown[] {
	const rows = Array.from(result);
	const dates = (result.columns ?? []).filter(
		(c) => DATES.has(c.type) || DATE_ARRAYS.has(c.type),
	);
	if (dates.length === 0) return rows;
	for (const row of rows as Record<string, unknown>[])
		for (const { name, type } of dates) {
			const value = row[name];
			row[name] = DATES.has(type) ? toDate(value) : toDates(value);
		}
	return rows;
}

export function executor(db: DrizzleDatabase): Executor {
	return async (text, values) => {
		const client = clientOf(db);
		if (client.unsafe) {
			const result = (await client.unsafe(
				text,
				values.map(postgresJsParam),
			)) as PostgresJsResult;
			return { rows: postgresJsRows(result), rowCount: result.count ?? null };
		}
		const query = client.query!.bind(client);
		const result = (await query(text, Array.from(values))) as {
			rows: unknown[];
			rowCount?: number | null;
			fields?: readonly PgField[];
		};
		const rows = await parsePgUserArrays(
			client,
			async (text, values) => (await query(text, values)) as { rows: [] },
			result.fields,
			result.rows,
		);
		return { rows, rowCount: result.rowCount ?? null };
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
