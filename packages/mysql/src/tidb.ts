import type { Executor, ExecutorResult, SqlPlugin } from "@typesql/core";
import {
	createTransactionalSql,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	type MySql,
	mysql,
	type ServerlessTypeMap,
	type TransactionalSql,
} from "@typesql/core/mysql";
import { inline } from "./literal.js";

interface FullResult {
	readonly rows: readonly unknown[] | null;
	readonly rowsAffected: number | null;
}

/** The options every statement runs with: rows as objects, with the affected row count. */
const OPTIONS = { fullResult: true, arrayMode: false } as const;

/**
 * A `@tidbcloud/serverless` Connection or the `Tx` of its `begin()`. Its own
 * `?` substitution also replaces a `?` inside a string literal, so values are
 * written into the statement as escaped literals instead.
 */
export interface TiDbQueryable {
	execute(
		query: string,
		args: null,
		options: typeof OPTIONS,
	): Promise<FullResult | readonly unknown[]>;
}

export interface TiDbTransaction extends TiDbQueryable {
	commit(): Promise<FullResult | readonly unknown[]>;
	rollback(): Promise<FullResult | readonly unknown[]>;
}

export interface TiDbConnection extends TiDbQueryable {
	begin(): Promise<TiDbTransaction>;
}

async function run(
	client: TiDbQueryable,
	text: string,
): Promise<ExecutorResult> {
	const result = await client.execute(text, null, OPTIONS);
	if (!("rows" in result)) return { rows: result, rowCount: result.length };
	const { rows, rowsAffected } = result;
	return rows && rows.length > 0
		? { rows, rowCount: rows.length }
		: { rows: [], rowCount: rowsAffected ?? 0 };
}

export function executor(client: TiDbQueryable): Executor {
	return (text, values) => run(client, inline(text, values));
}

const isConnection = (c: TiDbQueryable): c is TiDbConnection =>
	"begin" in c && typeof c.begin === "function";

async function transaction<T>(
	client: TiDbQueryable,
	depth: number,
	fn: (tx: TiDbQueryable) => Promise<T>,
): Promise<T> {
	if (depth > 0)
		return runTransaction(
			(statement) => client.execute(statement, null, OPTIONS),
			() => fn(client),
			{ savepoint: `typesql_${depth}` },
		);
	if (!isConnection(client))
		throw new Error(
			"typesql: sql.transaction() needs a @tidbcloud/serverless Connection",
		);
	// begin() opens a session of its own; the Connection stays outside it.
	const tx = await client.begin();
	try {
		const result = await fn(tx);
		await tx.commit();
		return result;
	} catch (err) {
		try {
			await tx.rollback();
		} catch {}
		throw err;
	}
}

const driver: SqlDriver<TiDbQueryable> = { executor, transaction };

export type TiDbSql<
	DB,
	TM = ServerlessTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export function createSql<DB, TM = ServerlessTypeMap>(
	client?: TiDbQueryable,
): TiDbSql<DB, TM> {
	return createTransactionalSql<MySql, DB, TM, TiDbQueryable>(
		mysql,
		client,
		driver,
	);
}
