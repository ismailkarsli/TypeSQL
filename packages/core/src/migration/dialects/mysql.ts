import {
	mariadb as mariadbSql,
	mysql as mysqlSql,
} from "../../mysql/dialect.js";
import type {
	DefaultTypeMap,
	Mysql2MariaDbTypeMap,
} from "../../mysql/type-map/index.js";
import type { Executor } from "../../query.js";
import {
	first,
	type MigratorDialect,
	quoted,
	rows,
	type Session,
	SPLIT,
	sha256,
	tryRun,
} from "./session.js";

/** MySQL's ER_SP_DOES_NOT_EXIST: `RELEASE SAVEPOINT` of a savepoint that isn't there. */
const noSavepoint = (cause: unknown): boolean =>
	(typeof cause === "object" &&
		cause !== null &&
		"errno" in cause &&
		cause.errno === 1305) ||
	/SAVEPOINT \S+ does not exist/i.test(
		cause instanceof Error ? cause.message : String(cause),
	);

/**
 * MySQL and MariaDB commit implicitly before and after each DDL statement,
 * so the history table is created before any migration's transaction, and a
 * migration's transaction may have ended before it fails. A session-level
 * lock serializes the commands instead of a transaction's.
 */
async function open(
	execute: Executor,
	tableName: string,
	transaction: boolean,
): Promise<Session> {
	const location = first(
		await rows(
			execute,
			"SELECT DATABASE() AS db, @@autocommit AS autocommit, CONNECTION_ID() AS id",
		),
	);
	if (
		location === undefined ||
		!("db" in location) ||
		typeof location.db !== "string" ||
		!("autocommit" in location) ||
		!("id" in location)
	)
		throw new Error(
			"typesql: no database selected: put the database in the connection URL",
		);
	// MySQL and MariaDB count identifier length in characters.
	if (Array.from(tableName).length > 64)
		throw new Error(
			"typesql: the migration table name exceeds MySQL's 64-character identifier limit",
		);
	const table = `${quoted(location.db, "`")}.${quoted(tableName, "`")}`;
	const createTable = `CREATE TABLE IF NOT EXISTS ${table} (name VARCHAR(255) NOT NULL PRIMARY KEY, hash VARCHAR(64) NOT NULL, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin`;
	const connectionId = String(location.id);
	/** The session's autocommit before the migrator turned it off. */
	const autocommit = Number(location.autocommit) === 0 ? 0 : 1;
	/** The session lock held for the command, released by giveBack(). */
	let sessionLock: string | undefined;
	/**
	 * Restores what the command changed on the session. The connection may be
	 * gone; the server then released the lock.
	 */
	const giveBack = async (): Promise<void> => {
		await tryRun(execute, `SET autocommit = ${autocommit}`);
		await tryRun(execute, "SELECT RELEASE_LOCK($1)", [sessionLock]);
	};
	/**
	 * Whether this call reaches the connection the command started on. A
	 * BEGIN inside a transaction would commit it there, so the connection's
	 * id is compared instead.
	 */
	const sameConnection = async (): Promise<boolean> => {
		const row = first(await rows(execute, "SELECT CONNECTION_ID() AS id"));
		return row !== undefined && "id" in row && String(row.id) === connectionId;
	};
	if (transaction) {
		// A session-level named lock, released by close() or when the
		// connection ends. Lock names are limited to 64 characters. MariaDB
		// rejects a negative (infinite) timeout, so wait for up to a year.
		const digest = await sha256(JSON.stringify([location.db, tableName]));
		const name = `typesql_migrate_${Array.from(
			new Uint8Array(digest).slice(0, 20),
			(byte) => byte.toString(16).padStart(2, "0"),
		).join("")}`;
		// The lock belongs to a session: taken on a pooled connection that
		// the next call doesn't get, it would stay held. An executor that
		// changes connection is refused before taking it, and the lock is
		// given back when it still landed elsewhere.
		if (!(await sameConnection())) throw new Error(SPLIT);
		const locked = first(
			await rows(
				execute,
				"SELECT GET_LOCK($1, 31536000) AS locked, CONNECTION_ID() AS id",
				[name],
			),
		);
		if (
			locked === undefined ||
			!("locked" in locked) ||
			Number(locked.locked) !== 1
		)
			throw new Error("typesql: cannot acquire the migration lock");
		if (!("id" in locked) || String(locked.id) !== connectionId) {
			await tryRun(execute, "SELECT RELEASE_LOCK($1)", [name]);
			throw new Error(SPLIT);
		}
		sessionLock = name;
		// With autocommit off, the statements after a migration's last DDL
		// statement commit together with its history record instead of one
		// by one.
		try {
			await execute("SET autocommit = 0", []);
			await execute(createTable, []);
		} catch (error) {
			// No session is returned, so its close() never runs.
			await giveBack();
			throw error;
		}
	} else await execute(createTable, []);
	return {
		table,
		createTable,
		read: `SELECT name, DATE_FORMAT(applied_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS at FROM ${table} ORDER BY applied_at, name`,
		insert: `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', GREATEST(UTC_TIMESTAMP(6), COALESCE(MAX(applied_at) + INTERVAL 1 MICROSECOND, UTC_TIMESTAMP(6))) FROM ${table}`,
		created: true,
		async begin() {
			await execute("START TRANSACTION", []);
			try {
				await execute("SAVEPOINT typesql_migration", []);
			} catch (error) {
				await tryRun(execute, "ROLLBACK");
				throw error;
			}
		},
		inTransaction: sameConnection,
		/**
		 * Whether the transaction begin() started is still the open one. Its
		 * savepoint is dropped when the transaction ends: by a statement that
		 * reached another connection, or by the implicit commit around a DDL
		 * statement, after which (with autocommit off) the next statement
		 * started a new transaction that ROLLBACK ends. The probe recreates
		 * the savepoint, so it can be asked again.
		 */
		async whole() {
			try {
				await execute("RELEASE SAVEPOINT typesql_migration", []);
			} catch (cause) {
				if (noSavepoint(cause)) return false;
				throw cause;
			}
			await execute("SAVEPOINT typesql_migration", []);
			return true;
		},
		async close() {
			if (sessionLock !== undefined) await giveBack();
		},
	};
}

const scan = {
	// In MySQL and MariaDB, a stored program's body may hold `;`-separated
	// statements inside BEGIN … END.
	programs: new Set(["PROCEDURE", "FUNCTION", "TRIGGER", "EVENT"]),
	notAtomicBlocks: true,
	xa: true,
} as const;

/**
 * The rows of a migration's `db`: what connect()'s mysql2 connection
 * returns (the mariadb connector stands in only without mysql2).
 */
export type MySqlRows = DefaultTypeMap;
export type MariaDbRows = Mysql2MariaDbTypeMap;

export const mysql: MigratorDialect = {
	server: "MySQL",
	sql: mysqlSql,
	target: "url",
	connect: async (url) =>
		(await import("../../mysql/driver.js")).connectMysql(url),
	scan,
	split: false,
	open,
	schema: "mysql",
};

/** MariaDB runs MySQL's migrator; the dialect names the server. */
export const mariadb: MigratorDialect = {
	...mysql,
	server: "MariaDB",
	sql: mariadbSql,
};
