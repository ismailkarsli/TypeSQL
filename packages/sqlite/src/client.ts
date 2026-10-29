import type { Executor } from "@typesql/core";
import {
	paramNumbers,
	runTransaction,
	type SqlDriver,
	sqliteValue,
} from "@typesql/core/adapter";

export interface SqliteStatement {
	all(...params: unknown[]): unknown[];
	run(...params: unknown[]): { readonly changes: number | bigint };
}

export interface SqliteDatabase {
	prepare(sql: string): SqliteStatement;
	exec(sql: string): unknown;
}

interface Prepared {
	readonly stmt: SqliteStatement;
	readonly reader: boolean;
	readonly names: readonly number[];
	readonly bare: boolean;
}

function isReader(stmt: SqliteStatement): boolean {
	const s = stmt as {
		readonly reader?: boolean;
		readonly columnNames?: readonly string[];
		columns?(): readonly unknown[];
	};
	if (typeof s.reader === "boolean") return s.reader;
	if (Array.isArray(s.columnNames)) return s.columnNames.length > 0;
	return typeof s.columns === "function" ? s.columns().length > 0 : true;
}

const isBetterSqlite3 = (stmt: SqliteStatement): boolean =>
	typeof (stmt as { readonly reader?: unknown }).reader === "boolean" &&
	typeof (stmt as { readonly pluck?: unknown }).pluck === "function";

const caches = new WeakMap<SqliteDatabase, Map<string, Prepared>>();
const CACHE_LIMIT = 500;

function readBigInts(stmt: SqliteStatement): void {
	const s = stmt as {
		setReadBigInts?(on: boolean): void;
		safeIntegers?(on: boolean): unknown;
	};
	if (s.setReadBigInts) s.setReadBigInts(true);
	else if (s.safeIntegers) s.safeIntegers(true);
	else
		throw new Error(
			"typesql: this driver cannot read integers as bigint per statement; enable it on the database (bun:sqlite: new Database(file, { safeIntegers: true }))",
		);
}

function prepared(db: SqliteDatabase, text: string, bigint: boolean): Prepared {
	let cache = caches.get(db);
	if (!cache) {
		cache = new Map();
		caches.set(db, cache);
	}
	const key = `${bigint ? "b" : "n"}${text}`;
	let p = cache.get(key);
	if (!p) {
		const stmt = db.prepare(text);
		if (bigint) readBigInts(stmt);
		p = {
			stmt,
			reader: isReader(stmt),
			names: paramNumbers(text),
			bare: isBetterSqlite3(stmt),
		};
		if (cache.size >= CACHE_LIMIT) cache.clear();
		cache.set(key, p);
	}
	return p;
}

function bind(p: Prepared, values: readonly unknown[]): unknown[] {
	if (p.names.length === 0) return [];
	const params: Record<string, unknown> = {};
	for (const n of p.names)
		params[p.bare ? String(n) : `$${n}`] = sqliteValue(values[n - 1]);
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
	return async (text, values) => {
		const p = prepared(db, text, bigint);
		const args = bind(p, values);
		if (p.reader) {
			const rows = p.stmt.all(...args);
			return { rows, rowCount: rows.length };
		}
		const { changes } = p.stmt.run(...args);
		return { rows: [], rowCount: Number(changes) };
	};
}

const queues = new WeakMap<SqliteDatabase, Promise<unknown>>();

async function transaction<T>(
	db: SqliteDatabase,
	depth: number,
	fn: (tx: SqliteDatabase) => Promise<T>,
): Promise<T> {
	const run = async (statement: string): Promise<void> => {
		db.exec(statement);
	};
	if (depth > 0)
		return runTransaction(run, () => fn(db), {
			savepoint: `typesql_${depth}`,
		});
	const previous = queues.get(db) ?? Promise.resolve();
	const current = previous.then(
		() => runTransaction(run, () => fn(db)),
		() => runTransaction(run, () => fn(db)),
	);
	queues.set(
		db,
		current.catch(() => undefined),
	);
	return current;
}

export const driver = (
	options: ExecutorOptions,
): SqlDriver<SqliteDatabase> => ({
	executor: (db) => executor(db, options),
	transaction,
});

export interface MigrationSource {
	readonly statements: readonly string[];
}

export async function migrate(
	db: SqliteDatabase,
	m: MigrationSource,
): Promise<void> {
	await transaction(db, 0, async () => {
		for (const statement of m.statements) db.exec(statement);
	});
}
