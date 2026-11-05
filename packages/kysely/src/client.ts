import type { Executor } from "@typesql/core";
import {
	JsonParam,
	mysqlPositional,
	positional,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	CompiledQuery,
	MysqlAdapter,
	type QueryResult,
	SqliteAdapter,
} from "kysely";

export interface KyselyExecutor {
	withoutPlugins(): {
		executeQuery<R>(query: CompiledQuery<R>): Promise<QueryResult<R>>;
	};
	transaction(): {
		execute<T>(fn: (trx: KyselyExecutor) => Promise<T>): Promise<T>;
	};
	readonly isTransaction: boolean;
}

type Compile = (
	text: string,
	values: readonly unknown[],
) => { readonly text: string; readonly values: unknown[] };

const numbered: Compile = (text, values) => ({
	text,
	values: Array.from(values),
});

// `sql.json(…)` becomes JSON text. mysql2 writes a Buffer as a binary
// literal and a plain Uint8Array as an object.
function mysqlParam<V>(value: V): V | string | Buffer {
	if (value instanceof JsonParam) return JSON.stringify(value.value);
	return value instanceof Uint8Array && !Buffer.isBuffer(value)
		? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		: value;
}

const mysql: Compile = (text, values) =>
	mysqlPositional(text, values, mysqlParam);

function run<R>(
	db: KyselyExecutor,
	text: string,
	values: readonly unknown[],
	compile: Compile = numbered,
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

type DialectName = "postgres" | "sqlite" | "mysql" | "mariadb";

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

/** The dialect `db` runs on, by its adapter: SQLite's, MySQL's or another (PostgreSQL's). */
const dialectOf = (db: KyselyExecutor): DialectName =>
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
	options: { readonly dialect?: DialectName } = {},
): Executor {
	const dialect = options.dialect ?? dialectOf(db);
	const compile =
		dialect === "sqlite"
			? positional
			: dialect === "mysql" || dialect === "mariadb"
				? mysql
				: numbered;
	return async (text, values) => {
		const result = await run<unknown>(db, text, values, compile);
		return { rows: result.rows, rowCount: rowCount(result) };
	};
}

function transaction<T>(
	db: KyselyExecutor,
	depth: number,
	fn: (trx: KyselyExecutor) => Promise<T>,
): Promise<T> {
	if (!db.isTransaction) return db.transaction().execute(fn);
	return runTransaction(
		(statement) => run(db, statement, []),
		() => fn(db),
		{ savepoint: `typesql_${depth + 1}` },
	);
}

export const driver: SqlDriver<KyselyExecutor> = {
	executor: (db) => executor(db),
	transaction,
};

export const sqliteDriver: SqlDriver<KyselyExecutor> = {
	executor: (db) => executor(db, { dialect: "sqlite" }),
	transaction,
};

export const mysqlDriver: SqlDriver<KyselyExecutor> = {
	executor: (db) => executor(db, { dialect: "mysql" }),
	transaction,
};
