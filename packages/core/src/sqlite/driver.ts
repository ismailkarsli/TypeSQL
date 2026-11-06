// The SQLite drivers' side of `sql`: parameters, values, and the node:sqlite
// connection of the migrator and `typesql introspect`.

import type { Connection } from "../connect.js";
import {
	type PositionalStatement,
	positionalAt,
	type SplitStatement,
	scan,
	splitAt,
} from "../runtime/compile.js";
import { jsonText } from "../runtime/json.js";
import { sqliteLexis } from "./dialect.js";

/** The parameter numbers a statement uses, in order of first use. */
export function paramNumbers(text: string): number[] {
	const seen = new Set<number>();
	scan(
		text,
		([t, n]) => {
			if (n) seen.add(+n);
			return t;
		},
		sqliteLexis,
	);
	return [...seen];
}

export function sqliteValue<V>(value: V): V | string | 0 | 1 {
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Date)
		throw new TypeError(
			"typesql: SQLite has no date type; pass an ISO string (date.toISOString()) or a number",
		);
	return jsonText(value);
}

/** What SQLite drivers bind: node:sqlite, better-sqlite3 and bun:sqlite. */
export type SqliteInput = null | number | bigint | string | ArrayBufferView;

/**
 * The named parameters of a statement that uses the parameters `numbers`,
 * converted with sqliteValue: `{ $1: … }`, or `{ 1: … }` for
 * better-sqlite3 (`bare`), which names them without their prefix.
 */
export function sqliteBindings(
	numbers: readonly number[],
	values: readonly unknown[],
	bare = false,
) {
	return Object.fromEntries(
		numbers.map((n) => {
			const input = sqliteValue(values[n - 1]);
			if (!isInput(input))
				throw new TypeError(
					`typesql: SQLite cannot bind ${typeof input} to parameter ${n}`,
				);
			return [bare ? n : `$${n}`, input];
		}),
	);
}

const isInput = <V>(value: V): value is V & SqliteInput =>
	value === null ||
	typeof value === "number" ||
	typeof value === "bigint" ||
	typeof value === "string" ||
	ArrayBuffer.isView(value);

/** `map` converts each value for the driver; sqliteValue by default. */
export function splitParams<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): SplitStatement {
	return splitAt<V, unknown>(text, values, map ?? sqliteValue, sqliteLexis);
}

export function positional<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): PositionalStatement {
	return positionalAt<V, unknown>(
		text,
		values,
		map ?? sqliteValue,
		sqliteLexis,
	);
}

/** How long a statement waits for another connection's lock. */
const BUSY_LIMIT = 30_000;

/**
 * Run a statement, waiting while another connection holds the database's
 * lock. busy_timeout would wait inside SQLite and block the event loop, so a
 * connection of the same process holding the lock could never release it.
 */
async function whenFree<T>(step: () => T): Promise<T> {
	const start = Date.now();
	for (let delay = 5; ; delay = Math.min(delay * 2, 100)) {
		try {
			return step();
		} catch (error) {
			// SQLITE_BUSY and its extended codes.
			const busy =
				typeof error === "object" &&
				error !== null &&
				"errcode" in error &&
				typeof error.errcode === "number" &&
				(error.errcode & 0xff) === 5;
			if (!busy || Date.now() - start >= BUSY_LIMIT) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}

/** A `node:sqlite` database, as the connection hands it out. */
export interface SqliteClient {
	prepare(sql: string): {
		columns(): readonly unknown[];
		all(...params: unknown[]): unknown[];
		run(...params: unknown[]): { readonly changes: number | bigint };
	};
	exec(sql: string): void;
	close(): void;
}

/**
 * One `node:sqlite` database for a file. It runs one statement per call:
 * the migrator sends a script's statements one by one, as for any SQLite
 * executor.
 */
export async function connectSqlite(
	file: string,
	options: { readonly readOnly?: boolean } = {},
): Promise<Connection<SqliteClient>> {
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db: SqliteClient = new DatabaseSync(file, {
		readOnly: options.readOnly === true,
	});
	return {
		client: db,
		execute: async (sql, values) => {
			const statement = await whenFree(() => db.prepare(sql));
			const bindings = sqliteBindings(paramNumbers(sql), values);
			if (statement.columns().length) {
				const rows = await whenFree(() => statement.all(bindings));
				return { rows, rowCount: rows.length };
			}
			const result = await whenFree(() => statement.run(bindings));
			return { rows: [], rowCount: Number(result.changes) };
		},
		close: async () => db.close(),
	};
}
