import type { Executor, ExecutorResult, SqlPlugin } from "@typesql/core";
import {
	createTransactionalSql,
	mysqlInline,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	type MySql,
	mysql,
	type ServerlessTypeMap,
	type TransactionalSql,
} from "@typesql/core/mysql";

export interface PlanetScaleResult {
	readonly rows: readonly unknown[];
	readonly rowsAffected: number;
	readonly fields?: readonly unknown[];
}

/**
 * A `@planetscale/database` Client, Connection or the `tx` of its
 * `transaction()`. Version 2 takes no parameters, so values are written into
 * the statement as escaped literals.
 */
export interface PlanetScaleQueryable {
	execute(query: string): Promise<PlanetScaleResult>;
}

export interface PlanetScaleClient extends PlanetScaleQueryable {
	transaction<T>(fn: (tx: PlanetScaleQueryable) => Promise<T>): Promise<T>;
}

async function run(
	client: PlanetScaleQueryable,
	text: string,
): Promise<ExecutorResult> {
	const { rows, rowsAffected, fields } = await client.execute(text);
	return fields && fields.length > 0
		? { rows, rowCount: rows.length }
		: { rows: [], rowCount: rowsAffected };
}

export function executor(client: PlanetScaleQueryable): Executor {
	return (text, values) => run(client, mysqlInline(text, values));
}

const isClient = (c: PlanetScaleQueryable): c is PlanetScaleClient =>
	"transaction" in c && typeof c.transaction === "function";

function transaction<T>(
	client: PlanetScaleQueryable,
	_depth: number,
	fn: (tx: PlanetScaleQueryable) => Promise<T>,
	savepoint: string | undefined,
): Promise<T> {
	if (savepoint !== undefined)
		return runTransaction(
			(statement) => client.execute(statement),
			() => fn(client),
			{ savepoint },
		);
	if (!isClient(client))
		return Promise.reject(
			new Error(
				"typesql: sql.transaction() needs a @planetscale/database Client or Connection",
			),
		);
	// A transaction runs on a new session of its own.
	return client.transaction(fn);
}

const driver: SqlDriver<PlanetScaleQueryable> = { executor, transaction };

export type PlanetScaleSql<
	DB,
	TM = ServerlessTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export function createSql<DB, TM = ServerlessTypeMap>(
	client?: PlanetScaleQueryable,
): PlanetScaleSql<DB, TM> {
	return createTransactionalSql<MySql, DB, TM, PlanetScaleQueryable>(
		mysql,
		client,
		driver,
	);
}
