import type { Executor } from "@typesql/core";
import {
	paramNumbers,
	type SqlDriver,
	serialTransaction,
	sqliteValue,
} from "@typesql/core/adapter";

export interface SqliteStatement {
	all(...params: unknown[]): unknown[];
	run(...params: unknown[]): { readonly changes: number | bigint };
}

export interface SqliteDatabase {
	prepare(sql: string): SqliteStatement;
	exec(sql: string): void;
}

interface Prepared {
	readonly stmt: SqliteStatement;
	readonly reader: boolean;
	readonly names: readonly number[];
	readonly bare: boolean;
}

// Statements of the drivers differ: better-sqlite3 has `reader` and `pluck()`,
// bun:sqlite `columnNames` and `safeIntegers()`, node:sqlite `columns()` and
// `setReadBigInts()`.

const hasColumns = (
	stmt: SqliteStatement,
): stmt is SqliteStatement & { columns(): readonly unknown[] } =>
	"columns" in stmt && typeof stmt.columns === "function";

const hasSetReadBigInts = (
	stmt: SqliteStatement,
): stmt is SqliteStatement & { setReadBigInts(on: boolean): void } =>
	"setReadBigInts" in stmt && typeof stmt.setReadBigInts === "function";

const hasSafeIntegers = (
	stmt: SqliteStatement,
): stmt is SqliteStatement & { safeIntegers(on: boolean): void } =>
	"safeIntegers" in stmt && typeof stmt.safeIntegers === "function";

function isReader(stmt: SqliteStatement): boolean {
	if ("reader" in stmt && typeof stmt.reader === "boolean") return stmt.reader;
	if ("columnNames" in stmt && Array.isArray(stmt.columnNames))
		return stmt.columnNames.length > 0;
	return hasColumns(stmt) ? stmt.columns().length > 0 : true;
}

const isBetterSqlite3 = (stmt: SqliteStatement): boolean =>
	"reader" in stmt &&
	typeof stmt.reader === "boolean" &&
	"pluck" in stmt &&
	typeof stmt.pluck === "function";

function readBigInts(stmt: SqliteStatement): void {
	if (hasSetReadBigInts(stmt)) stmt.setReadBigInts(true);
	else if (hasSafeIntegers(stmt)) stmt.safeIntegers(true);
	else
		throw new Error(
			"typesql: this driver cannot read integers as bigint per statement; enable it on the database (bun:sqlite: new Database(file, { safeIntegers: true }))",
		);
}

function prepared(db: SqliteDatabase, text: string, bigint: boolean): Prepared {
	const stmt = db.prepare(text);
	if (bigint) readBigInts(stmt);
	return {
		stmt,
		reader: isReader(stmt),
		names: paramNumbers(text),
		bare: isBetterSqlite3(stmt),
	};
}

function bind(p: Prepared, values: readonly unknown[]): unknown[] {
	if (p.names.length === 0) return [];
	const params = Object.fromEntries(
		p.names.map((n) => [
			p.bare ? String(n) : `$${n}`,
			sqliteValue(values[n - 1]),
		]),
	);
	return [params];
}

export interface ExecutorOptions {
	readonly bigint?: boolean;
}

export function executor(
	db: SqliteDatabase,
	options: ExecutorOptions = {},
): Executor {
	const bigint = options.bigint === true;
	return Object.assign(
		async (text: string, values: readonly unknown[]) =>
			run(prepared(db, text, bigint), values),
		{
			// sql.prepare(): prepare the statement once and reuse it.
			prepare: (text: string): Executor => {
				let p: Prepared | undefined;
				return async (_text, values) => {
					p ??= prepared(db, text, bigint);
					return run(p, values);
				};
			},
		},
	);
}

function run(p: Prepared, values: readonly unknown[]) {
	const args = bind(p, values);
	if (p.reader) {
		const rows = p.stmt.all(...args);
		return { rows, rowCount: rows.length };
	}
	const { changes } = p.stmt.run(...args);
	return { rows: [], rowCount: Number(changes) };
}

async function transaction<T>(
	db: SqliteDatabase,
	depth: number,
	fn: (tx: SqliteDatabase) => Promise<T>,
): Promise<T> {
	return serialTransaction(
		db,
		depth,
		async (statement) => {
			db.exec(statement);
		},
		() => fn(db),
	);
}

export const driver = (
	options: ExecutorOptions,
): SqlDriver<SqliteDatabase> => ({
	executor: (db) => executor(db, options),
	transaction,
});
