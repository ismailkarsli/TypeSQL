import type { Executor } from "@typesql/core";
import {
	type SqlDriver,
	serialTransaction,
	splitParams,
} from "@typesql/core/adapter";
import { Param, SQL, type SQLChunk, StringChunk } from "drizzle-orm";

export interface DrizzleSqliteDatabase {
	all(query: never): void;
	run(query: never): void;
	transaction(fn: never): void;
}

/** What `run()` resolves to: better-sqlite3 and bun:sqlite count `changes`, libsql `rowsAffected`. */
interface RunResult {
	readonly changes?: number | bigint;
	readonly rowsAffected?: number | bigint;
}

/** The methods of a Drizzle SQLite database, sync or async, that typesql calls. */
interface Runner {
	all(query: SQL): unknown[] | PromiseLike<unknown[]>;
	run(
		query: SQL,
	): RunResult | null | undefined | PromiseLike<RunResult | null | undefined>;
	transaction<T>(fn: (tx: DrizzleSqliteDatabase) => Promise<T>): Promise<T>;
}

const isRunner = (db: DrizzleSqliteDatabase): db is Runner =>
	typeof db.all === "function" &&
	typeof db.run === "function" &&
	typeof db.transaction === "function";

function runner(db: DrizzleSqliteDatabase): Runner {
	if (isRunner(db)) return db;
	throw new Error(
		"typesql: a Drizzle SQLite database needs all(), run() and transaction()",
	);
}

const isAsync = (db: DrizzleSqliteDatabase): boolean =>
	"resultKind" in db && db.resultKind === "async";

function statement(text: string, values: readonly unknown[]): SQL {
	const split = splitParams(text, values);
	const chunks: SQLChunk[] = [];
	split.parts.forEach((part, i) => {
		chunks.push(new StringChunk(part));
		if (i < split.values.length) chunks.push(new Param(split.values[i]));
	});
	return new SQL(chunks);
}

function changes(result: RunResult | null | undefined): number {
	return Number(result?.changes ?? result?.rowsAffected ?? 0);
}

// better-sqlite3 refuses `all()` for statements without rows before running
// them; such statements run with `run()` instead. Drizzle may wrap the error.
const NO_DATA = /does not return data/;
const noData = (cause: unknown): boolean =>
	cause instanceof Error &&
	(NO_DATA.test(cause.message) || noData(cause.cause));

// libsql returns BLOBs as ArrayBuffer; rows are typed with Uint8Array.
function blobs<R>(row: R): R {
	if (row === null || typeof row !== "object") return row;
	for (const key in row) {
		const value = row[key];
		if (value instanceof ArrayBuffer)
			Object.assign(row, { [key]: new Uint8Array(value) });
	}
	return row;
}

async function all(
	db: DrizzleSqliteDatabase,
	text: string,
	values: readonly unknown[],
): Promise<unknown[]> {
	try {
		const rows = await runner(db).all(statement(text, values));
		return isAsync(db) ? rows.map(blobs) : rows;
	} catch (e) {
		if (!noData(e)) throw e;
		await runner(db).run(statement(text, values));
		return [];
	}
}

export function sqliteExecutor(db: DrizzleSqliteDatabase): Executor {
	return Object.assign(
		(text: string, values: readonly unknown[]) => all(db, text, values),
		{
			count: async (text: string, values: readonly unknown[]) =>
				changes(await runner(db).run(statement(text, values))),
		},
	);
}

function transaction<T>(
	db: DrizzleSqliteDatabase,
	depth: number,
	fn: (tx: DrizzleSqliteDatabase) => Promise<T>,
): Promise<T> {
	if (isAsync(db)) return runner(db).transaction(fn);
	return serialTransaction(
		db,
		depth,
		async (sql) => {
			await runner(db).run(new SQL([new StringChunk(sql)]));
		},
		() => fn(db),
	);
}

export const sqliteDriver: SqlDriver<DrizzleSqliteDatabase> = {
	executor: sqliteExecutor,
	transaction,
};
