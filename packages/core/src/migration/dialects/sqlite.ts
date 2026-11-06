import type { Executor } from "../../query.js";
import { sqlite as sql } from "../../sqlite/dialect.js";
import type { DefaultTypeMap } from "../../sqlite/type-map/index.js";
import {
	type MigratorDialect,
	quoted,
	type Session,
	tryRun,
} from "./session.js";

/** SQLite's error for a BEGIN inside a transaction, as every driver reports it. */
const NESTED = /cannot start a transaction within a transaction/i;

async function open(execute: Executor, tableName: string): Promise<Session> {
	const table = quoted(tableName, '"');
	const now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
	return {
		table,
		createTable: `CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		read: `SELECT name, applied_at AS at FROM ${table} ORDER BY applied_at, name`,
		insert: `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', CASE WHEN max(applied_at) IS NULL OR ${now} > max(applied_at) THEN ${now} ELSE strftime('%Y-%m-%d %H:%M:%f', max(applied_at), '+0.001 seconds') END FROM ${table}`,
		created: false,
		async begin() {
			await execute("BEGIN IMMEDIATE", []);
		},
		// A BEGIN fails inside a transaction. One that succeeds started a
		// transaction where there was none; end it. Any other failure is the
		// connection's, and the caller's to see.
		async inTransaction() {
			try {
				await execute("BEGIN", []);
			} catch (cause) {
				if (NESTED.test(cause instanceof Error ? cause.message : String(cause)))
					return true;
				throw cause;
			}
			await tryRun(execute, "ROLLBACK");
			return false;
		},
	};
}

/** The rows of a migration's `db`: what connect()'s `node:sqlite` database returns. */
export type SqliteRows = DefaultTypeMap;

export const sqlite: MigratorDialect = {
	server: "SQLite",
	sql,
	target: "db",
	connect: async (file) =>
		(await import("../../sqlite/driver.js")).connectSqlite(file),
	scan: { programs: new Set(["TRIGGER"]) },
	split: true,
	open,
	schema: "sqlite",
};
