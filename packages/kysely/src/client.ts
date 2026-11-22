import type { Executor } from "@typesql/core";
import {
	type DialectFamily,
	dialectFamily,
	familyStatement,
	mysqlBind,
	type PositionalStatement,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	CompiledQuery,
	MysqlAdapter,
	type QueryResult,
	SelectQueryNode,
	SqliteAdapter,
} from "kysely";

export interface KyselyExecutor {
	withoutPlugins(): {
		executeQuery<R>(query: CompiledQuery<R>): Promise<QueryResult<R>>;
		/** A Kysely instance's or a transaction's; `stream()` needs it. */
		getExecutor?(): {
			stream<R>(
				query: CompiledQuery<R>,
				chunkSize: number,
			): AsyncIterable<QueryResult<R>>;
		};
	};
	transaction(): {
		execute<T>(fn: (trx: KyselyExecutor) => Promise<T>): Promise<T>;
	};
	readonly isTransaction: boolean;
}

type Compile = (
	text: string,
	values: readonly unknown[],
) => PositionalStatement;

const compileFor =
	(family: DialectFamily): Compile =>
	(text, values) =>
		// Kysely's MysqlDialect runs on mysql2, which binds a Buffer, not a Uint8Array.
		familyStatement[family](
			text,
			values,
			family === "mysql" ? mysqlBind : undefined,
		);

function run<R>(
	db: KyselyExecutor,
	text: string,
	values: readonly unknown[],
	compile: Compile = compileFor("postgres"),
): Promise<QueryResult<R>> {
	const q = compile(text, values);
	return db
		.withoutPlugins()
		.executeQuery<R>(CompiledQuery.raw(q.text, q.values));
}

function rowCount(result: QueryResult<unknown>): number {
	return result.numAffectedRows === undefined
		? result.rows.length
		: Number(result.numAffectedRows);
}

/**
 * Whether `db`'s dialect adapter is `Adapter`, from this copy of Kysely or
 * by name from another.
 */
function hasAdapter(
	db: KyselyExecutor,
	Adapter: abstract new (...args: never[]) => object,
): boolean {
	if (!hasExecutor(db)) return false;
	const { adapter } = db.getExecutor();
	return (
		adapter instanceof Adapter ||
		(typeof adapter === "object" &&
			adapter !== null &&
			typeof adapter.constructor === "function" &&
			adapter.constructor.name === Adapter.name)
	);
}

// A Kysely instance (not only a transaction) has getExecutor().
const hasExecutor = (
	db: KyselyExecutor,
): db is KyselyExecutor & {
	getExecutor(): { readonly adapter?: unknown };
} => "getExecutor" in db && typeof db.getExecutor === "function";

const dialectOf = (db: KyselyExecutor): DialectFamily =>
	hasAdapter(db, SqliteAdapter)
		? "sqlite"
		: hasAdapter(db, MysqlAdapter)
			? "mysql"
			: "postgres";

/**
 * An executor on `db`. SQLite's placeholders are used when `dialect` is
 * `"sqlite"` and MySQL's when it is `"mysql"` or `"mariadb"`; without
 * `dialect`, when `db` runs on Kysely's SQLite or MySQL dialect.
 */
export function executor(
	db: KyselyExecutor,
	options: { readonly dialect?: DialectFamily | "mariadb" } = {},
): Executor {
	const family = options.dialect
		? dialectFamily(options.dialect)
		: dialectOf(db);
	const compile = compileFor(family);
	return Object.assign(
		async (text: string, values: readonly unknown[]) => {
			const result = await run<unknown>(db, text, values, compile);
			return { rows: result.rows, rowCount: rowCount(result) };
		},
		{
			stream: (text: string, values: readonly unknown[], batchSize: number) =>
				streamRows(db, compile(text, values), batchSize, family),
		},
	);
}

// Kysely checks out a connection for the stream and its dialect reads the
// rows: PostgresDialect needs its `cursor` option for that.
async function* streamRows(
	db: KyselyExecutor,
	q: PositionalStatement,
	batchSize: number,
	family: DialectFamily,
): AsyncGenerator<unknown[]> {
	const executor = db.withoutPlugins().getExecutor?.();
	if (!executor)
		throw new Error("typesql: this Kysely executor cannot stream rows");
	const raw = CompiledQuery.raw(q.text, q.values);
	// SqliteDialect streams only what its node says is a SELECT; it reads the
	// node for nothing else, and the rows come from the statement either way.
	const query =
		family === "sqlite" ? { ...raw, query: SelectQueryNode.create() } : raw;
	for await (const result of executor.stream(query, batchSize))
		yield result.rows;
}

// A Kysely transaction (`trx`, or one the user passed) gets a savepoint.
function transaction<T>(
	db: KyselyExecutor,
	_depth: number,
	fn: (trx: KyselyExecutor) => Promise<T>,
	savepoint: string | undefined,
): Promise<T> {
	if (savepoint === undefined) return db.transaction().execute(fn);
	return runTransaction(
		(statement) => run(db, statement, []),
		() => fn(db),
		{ savepoint },
	);
}

/** The driver for a `sql` of the dialect family `dialect`. */
export const driverOf = (
	dialect: DialectFamily,
): SqlDriver<KyselyExecutor> => ({
	executor: (db) => executor(db, { dialect }),
	transaction,
	inTransaction: (db) => db.isTransaction,
});
