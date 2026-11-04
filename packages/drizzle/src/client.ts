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
export const isSqliteDatabase = (
	db: DrizzleDatabase | DrizzleSqliteDatabase,
): db is DrizzleSqliteDatabase =>
	"all" in db &&
	typeof db.all === "function" &&
	"run" in db &&
	typeof db.run === "function";

// Every Drizzle database, on PostgreSQL or SQLite, has a session.
export const isDrizzleDatabase = (
	db: DrizzleDatabase | DrizzleSqliteDatabase,
): db is DrizzleDatabase =>
	"_" in db &&
	typeof db._ === "object" &&
	db._ !== null &&
	"session" in db._ &&
	typeof db._.session === "object" &&
	db._.session !== null &&
	typeof db.transaction === "function";

interface PgQueryResult {
	readonly rows: unknown[];
	readonly rowCount?: number | null;
	readonly fields?: readonly PgField[];
}

type PostgresJsResult = unknown[] & {
	readonly count?: number | null;
	readonly columns?: readonly {
		readonly name: string;
		readonly type: number;
	}[];
};

/** The session client: node-postgres (query) or postgres.js (unsafe). */
interface DriverClient {
	query?(text: string, values: unknown[]): Promise<PgQueryResult>;
	unsafe?(text: string, values: unknown[]): PromiseLike<PostgresJsResult>;
}

const isDriverClient = (client: unknown): client is DriverClient =>
	(typeof client === "object" || typeof client === "function") &&
	client !== null &&
	(("unsafe" in client && typeof client.unsafe === "function") ||
		("query" in client && typeof client.query === "function"));

function clientOf(db: DrizzleDatabase): DriverClient {
	const { session } = db._;
	const client = "client" in session ? session.client : undefined;
	if (isDriverClient(client)) return client;
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

const PARSERS = new Map<number, (text: string) => Date>([
	[1082, parseDate],
	[1114, parseTimestamp],
	[1184, parseDate],
]);
const ARRAY_PARSERS = new Map<number, (text: string) => Date | string>([
	[1182, parseDate],
	[1115, parseTimestamp],
	[1185, parseDate],
	[1231, parseText],
]);

/** A value written as an element of an array literal. */
type Literal =
	| string
	| number
	| bigint
	| boolean
	| Date
	| null
	| readonly Literal[];

const isList = (value: Literal): value is readonly Literal[] =>
	Array.isArray(value);

// Array elements written as an array literal, at any depth.
const isLiteral = (value: unknown): value is Literal =>
	value === null ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "bigint" ||
	typeof value === "boolean" ||
	value instanceof Date ||
	(Array.isArray(value) && value.every(isLiteral));

const isLiteralList = (
	values: readonly unknown[],
): values is readonly Literal[] => values.every(isLiteral);

function arrayLiteral(values: readonly Literal[]): string {
	const element = (value: Literal): string => {
		if (value === null) return "NULL";
		if (isList(value)) return arrayLiteral(value);
		if (typeof value === "boolean") return value ? "t" : "f";
		const text = value instanceof Date ? value.toISOString() : String(value);
		return `"${text.replace(/[\\"]/g, "\\$&")}"`;
	};
	return `{${values.map(element).join(",")}}`;
}

function postgresJsParam<V>(value: V): V | string {
	if (value instanceof Date) return value.toISOString();
	// The identity serializers of date, timestamp and numeric arrays would send
	// a JS array as `'' + array`; an array literal works for every array type.
	if (Array.isArray(value))
		return isLiteralList(value) ? arrayLiteral(value) : value;
	if (value === null || typeof value !== "object" || ArrayBuffer.isView(value))
		return value;
	return JSON.stringify(value);
}

function postgresJsRows(result: PostgresJsResult): unknown[] {
	const rows = Array.from(result);
	const parsers = (result.columns ?? []).flatMap(({ name, type }) => {
		const element = ARRAY_PARSERS.get(type);
		const parse =
			PARSERS.get(type) ??
			(element && ((text: string) => parsePgArray(text, element)));
		return parse ? [[name, parse] as const] : [];
	});
	if (parsers.length === 0) return rows;
	for (const row of rows) {
		if (typeof row !== "object" || row === null) continue;
		for (const [name, parse] of parsers) {
			const value: unknown = Object.getOwnPropertyDescriptor(row, name)?.value;
			if (typeof value === "string")
				Object.assign(row, { [name]: parse(value) });
		}
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
			const result = await client.unsafe(text, values.map(postgresJsParam));
			return { rows: postgresJsRows(result), rowCount: result.count ?? null };
		}
		const query = client.query!.bind(client);
		const result = await query(text, Array.from(values));
		const rows = await parsePgUserArrays(
			client,
			(text, values) => query(text, values),
			result.fields,
			result.rows,
		);
		return { rows, rowCount: result.rowCount ?? null };
	};
}

export const driver: SqlDriver<DrizzleDatabase> = {
	executor,
	transaction: (db, _depth, fn) => db.transaction(fn),
};
