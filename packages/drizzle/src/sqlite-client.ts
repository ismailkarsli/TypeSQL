import type { Executor } from "@typesql/core";
import {
	runTransaction,
	type SqlDriver,
	splitParams,
} from "@typesql/core/adapter";
import { Param, SQL, type SQLChunk, StringChunk } from "drizzle-orm";

export interface DrizzleSqliteDatabase {
	all(query: never): unknown;
	run(query: never): unknown;
	transaction(fn: never): unknown;
}

interface Runner {
	all(query: SQL): unknown;
	run(query: SQL): unknown;
	transaction<T>(fn: (tx: DrizzleSqliteDatabase) => Promise<T>): Promise<T>;
}

const runner = (db: DrizzleSqliteDatabase): Runner => db as unknown as Runner;

const isAsync = (db: DrizzleSqliteDatabase): boolean =>
	(db as { readonly resultKind?: unknown }).resultKind === "async";

function statement(text: string, values: readonly unknown[]): SQL {
	const split = splitParams(text, values);
	const chunks: SQLChunk[] = [];
	split.parts.forEach((part, i) => {
		chunks.push(new StringChunk(part));
		if (i < split.values.length) chunks.push(new Param(split.values[i]));
	});
	return new SQL(chunks);
}

function changes(result: unknown): number {
	const r = (result ?? {}) as {
		readonly changes?: number | bigint;
		readonly rowsAffected?: number | bigint;
	};
	return Number(r.changes ?? r.rowsAffected ?? 0);
}

// better-sqlite3 refuses `all()` for statements without rows before running
// them; such statements run with `run()` instead. Drizzle may wrap the error.
const NO_DATA = /does not return data/;
const noData = (e: unknown): boolean =>
	e instanceof Error && (NO_DATA.test(e.message) || noData(e.cause));

async function all(
	db: DrizzleSqliteDatabase,
	text: string,
	values: readonly unknown[],
): Promise<unknown[]> {
	try {
		return (await runner(db).all(statement(text, values))) as unknown[];
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

const queues = new WeakMap<object, Promise<unknown>>();

function transaction<T>(
	db: DrizzleSqliteDatabase,
	depth: number,
	fn: (tx: DrizzleSqliteDatabase) => Promise<T>,
): Promise<T> {
	if (isAsync(db)) return runner(db).transaction(fn);
	const run = async (sql: string): Promise<void> => {
		await runner(db).run(new SQL([new StringChunk(sql)]));
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

export const sqliteDriver: SqlDriver<DrizzleSqliteDatabase> = {
	executor: sqliteExecutor,
	transaction,
};
