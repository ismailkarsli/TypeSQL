import type { Executor } from "@typesql/core";
import { runTransaction, type SqlDriver } from "@typesql/core/adapter";

export type PostgresJsRows = readonly unknown[] & {
	readonly count: number | null;
};

export interface PostgresJsQueryable {
	unsafe(
		query: string,
		parameters?: unknown[],
		options?: { readonly prepare: boolean; readonly simple: boolean },
	): PromiseLike<PostgresJsRows>;
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

export function executor(sql: PostgresJsQueryable): Executor {
	const run: Executor = async (text, values) => {
		const result = await sql.unsafe(text, Array.from(values));
		return { rows: Array.from(result), rowCount: result.count ?? null };
	};
	return Object.assign(run, {
		prepare: (): Executor => async (text, values) => {
			const result = await sql.unsafe(text, Array.from(values), {
				prepare: true,
				simple: false,
			});
			return { rows: Array.from(result), rowCount: result.count ?? null };
		},
	});
}

async function transaction<T>(
	sql: PostgresJsQueryable,
	_depth: number,
	fn: (tx: PostgresJsQueryable) => Promise<T>,
	savepoint: string | undefined,
): Promise<T> {
	if (canSavepoint(sql)) return sql.savepoint(fn);
	if (canBegin(sql)) return sql.begin(fn);
	// A ReservedSql is one connection without begin or savepoint.
	if (isReserved(sql))
		return runTransaction(
			(statement) => sql.unsafe(statement),
			() => fn(sql),
			{ savepoint },
		);
	throw new Error(
		"typesql: sql.transaction() needs a postgres.js Sql, ReservedSql or TransactionSql (with begin, savepoint or release)",
	);
}

export const driver: SqlDriver<PostgresJsQueryable> = { executor, transaction };
