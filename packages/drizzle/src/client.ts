import type { Executor } from "@typesql/core";
import {
	type PgField,
	parsePgArray,
	parsePgUserArrays,
	type SqlDriver,
} from "@typesql/core/adapter";
import { type DrizzleSqliteDatabase, sqliteExecutor } from "./sqlite-client.js";

export interface DrizzleDatabase {
	readonly _: { readonly session: object };
	transaction<T>(fn: (tx: DrizzleDatabase) => Promise<T>): Promise<T>;
}

// Drizzle's SQLite databases have all() and run(); its PostgreSQL ones don't.
const isSqliteDatabase = (
	db: DrizzleDatabase | DrizzleSqliteDatabase,
): db is DrizzleSqliteDatabase =>
	typeof (db as { all?: unknown }).all === "function" &&
	typeof (db as { run?: unknown }).run === "function";

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

// Drizzle replaces postgres.js's json, jsonb, date, timestamp, timestamptz and
// numeric[] serializers and parsers (and those of their arrays) with identity
// functions on the shared client. Serialize those values here, and parse them
// back, so values match the default type map.

// A `timestamp` has no time zone. Dates are sent as UTC (toISOString), so read
// it as UTC too, as Drizzle's timestamp() does, not as local time.
const parseTimestamp = (text: string): Date =>
	new Date(/^\d/.test(text) ? `${text}+0000` : text);
const parseDate = (text: string): Date => new Date(text);
const parseText = (text: string): string => text;

const PARSERS: { readonly [oid: number]: (text: string) => unknown } = {
	1082: parseDate,
	1114: parseTimestamp,
	1184: parseDate,
};
const ARRAY_PARSERS: { readonly [oid: number]: (text: string) => unknown } = {
	1182: parseDate,
	1115: parseTimestamp,
	1185: parseDate,
	1231: parseText,
};

// Array elements written as an array literal, at any depth.
const isLiteral = (value: unknown): boolean =>
	value === null ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "bigint" ||
	typeof value === "boolean" ||
	value instanceof Date ||
	(Array.isArray(value) && value.every(isLiteral));

function arrayLiteral(values: readonly unknown[]): string {
	const element = (value: unknown): string => {
		if (value === null) return "NULL";
		if (Array.isArray(value)) return arrayLiteral(value);
		if (typeof value === "boolean") return value ? "t" : "f";
		const text = value instanceof Date ? value.toISOString() : String(value);
		return `"${text.replace(/[\\"]/g, "\\$&")}"`;
	};
	return `{${values.map(element).join(",")}}`;
}

function postgresJsParam(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	// The identity serializers of date, timestamp and numeric arrays would send
	// a JS array as `'' + array`; an array literal works for every array type.
	if (Array.isArray(value))
		return isLiteral(value) ? arrayLiteral(value) : value;
	if (value === null || typeof value !== "object" || ArrayBuffer.isView(value))
		return value;
	return JSON.stringify(value);
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
	const parsers = (result.columns ?? []).flatMap(({ name, type }) => {
		const scalar = PARSERS[type];
		if (scalar) return [[name, scalar] as const];
		const element = ARRAY_PARSERS[type];
		return element
			? [[name, (text: string) => parsePgArray(text, element)] as const]
			: [];
	});
	if (parsers.length === 0) return rows;
	for (const row of rows as Record<string, unknown>[])
		for (const [name, parse] of parsers) {
			const value = row[name];
			if (typeof value === "string") row[name] = parse(value);
		}
	return rows;
}

/**
 * An executor on `db`. A database on a SQLite driver (better-sqlite3,
 * libsql, bun:sqlite, D1) gets `sqliteExecutor(db)`.
 */
export function executor(
	db: DrizzleDatabase | DrizzleSqliteDatabase,
): Executor {
	if (isSqliteDatabase(db)) return sqliteExecutor(db);
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
