import type { Executor } from "@typesql/core";
import { exclusiveTransaction, type SqlDriver } from "@typesql/core/adapter";

export type PostgresJsRows = readonly unknown[] & {
	readonly count: number | null;
};

type Options = { readonly prepare: boolean; readonly simple: boolean };

/** A postgres.js query, which runs when awaited or when `cursor()` starts it. */
type PostgresJsPending = PromiseLike<PostgresJsRows> & {
	readonly cursor?: (rows: number) => AsyncIterable<readonly unknown[]>;
};

export interface PostgresJsQueryable {
	unsafe(
		query: string,
		parameters?: unknown[],
		options?: Options,
	): PostgresJsPending;
}

export interface PostgresJsTransactable<
	Tx extends PostgresJsQueryable = PostgresJsQueryable,
> {
	begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

interface PostgresJsReserved {
	release(): void;
}

interface PostgresJsSavepointable {
	savepoint<T>(fn: (tx: PostgresJsQueryable) => Promise<T>): Promise<T>;
}

// A TransactionSql has savepoint(), a Sql begin() and a ReservedSql release().
const canSavepoint = (
	sql: PostgresJsQueryable,
): sql is PostgresJsQueryable & PostgresJsSavepointable =>
	"savepoint" in sql && typeof sql.savepoint === "function";

const canBegin = (
	sql: PostgresJsQueryable,
): sql is PostgresJsQueryable & PostgresJsTransactable =>
	"begin" in sql && typeof sql.begin === "function";

const isReserved = (
	sql: PostgresJsQueryable,
): sql is PostgresJsQueryable & PostgresJsReserved =>
	"release" in sql && typeof sql.release === "function";

const PREPARE: Options = { prepare: true, simple: false };
// A cursor needs the extended protocol, which a query without parameters
// would not use.
const UNPREPARED: Options = { prepare: false, simple: false };

export function executor(sql: PostgresJsQueryable): Executor {
	const runner =
		(options?: Options): Executor =>
		async (text, values) => {
			const result = await sql.unsafe(text, Array.from(values), options);
			return { rows: Array.from(result), rowCount: result.count ?? null };
		};
	// postgres.js reserves a connection of a Sql for the cursor.
	const stream =
		(options: Options) =>
		(text: string, values: readonly unknown[], batchSize: number) => {
			const query = sql.unsafe(text, Array.from(values), options);
			if (!query.cursor)
				throw new Error("typesql: this postgres.js client cannot stream rows");
			return query.cursor(batchSize);
		};
	return Object.assign(runner(), {
		prepare: (): Executor =>
			Object.assign(runner(PREPARE), { stream: stream(PREPARE) }),
		stream: stream(UNPREPARED),
	});
}

async function transaction<T>(
	sql: PostgresJsQueryable,
	depth: number,
	fn: (tx: PostgresJsQueryable) => Promise<T>,
): Promise<T> {
	if (canSavepoint(sql)) return sql.savepoint(fn);
	if (canBegin(sql)) return sql.begin(fn);
	// A ReservedSql is one connection without begin or savepoint.
	if (isReserved(sql))
		return exclusiveTransaction(
			sql,
			depth,
			(statement) => sql.unsafe(statement),
			() => fn(sql),
		);
	throw new Error(
		"typesql: sql.transaction() needs a postgres.js Sql, ReservedSql or TransactionSql (with begin, savepoint or release)",
	);
}

export const driver: SqlDriver<PostgresJsQueryable> = { executor, transaction };
