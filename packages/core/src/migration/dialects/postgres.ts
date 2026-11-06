import { hasCode } from "../../command.js";
import { postgres as sql } from "../../postgres/dialect.js";
import type { NodePostgresTypeMap } from "../../postgres/type-map/index.js";
import type { Executor } from "../../query.js";
import {
	first,
	type MigratorDialect,
	quoted,
	rows,
	type Session,
	sha256,
} from "./session.js";

/** The `xid` column of the first row: a transaction id's text. */
const xidOf = (records: readonly unknown[]): string | undefined => {
	const row = first(records);
	return row && "xid" in row && typeof row.xid === "string"
		? row.xid
		: undefined;
};

async function open(
	execute: Executor,
	tableName: string,
	transaction: boolean,
): Promise<Session> {
	const location = first(
		await rows(
			execute,
			"SELECT current_schema() AS schema, current_database() AS database, current_setting('max_identifier_length')::integer AS max_identifier_length",
		),
	);
	if (
		location === undefined ||
		!("schema" in location) ||
		typeof location.schema !== "string" ||
		!("database" in location) ||
		typeof location.database !== "string" ||
		!("max_identifier_length" in location) ||
		typeof location.max_identifier_length !== "number"
	)
		throw new Error(
			"typesql: cannot determine the PostgreSQL migration schema",
		);
	if (
		new TextEncoder().encode(tableName).length > location.max_identifier_length
	)
		throw new Error(
			`typesql: the migration table name exceeds PostgreSQL's ${location.max_identifier_length}-byte identifier limit`,
		);
	const table = `${quoted(location.schema, '"')}.${quoted(tableName, '"')}`;
	const lock = transaction
		? new DataView(
				await sha256(
					JSON.stringify([location.database, location.schema, tableName]),
				),
			)
				.getBigInt64(0)
				.toString()
		: undefined;
	let xid: string | undefined;
	return {
		table,
		createTable: `CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		read: `SELECT name, to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM ${table} ORDER BY applied_at, name`,
		insert: `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', greatest(clock_timestamp(), max(applied_at) + interval '1 microsecond') FROM ${table}`,
		created: false,
		async begin() {
			await execute("BEGIN", []);
			// The lock ends with the transaction, so it can't stay held on a
			// pooled connection. Its void result stays in FROM: Prisma can't
			// read a void column.
			xid = xidOf(
				await rows(
					execute,
					"SELECT txid_current()::text AS xid FROM pg_advisory_xact_lock($1::bigint)",
					[lock],
				),
			);
		},
		inTransaction: async () =>
			xidOf(
				await rows(execute, "SELECT txid_current_if_assigned()::text AS xid"),
			) === xid,
		// After a failed statement PostgreSQL refuses every one but ROLLBACK
		// (in_failed_sql_transaction, from pg, postgres.js or Prisma): the
		// transaction is still there.
		aborted: (cause) =>
			hasCode(cause, "25P02") ||
			/current transaction is aborted/.test(
				cause instanceof Error ? cause.message : String(cause),
			),
	};
}

/** The rows of a migration's `db`: what connect()'s `pg` client returns. */
export type PostgresRows = NodePostgresTypeMap;

export const postgres: MigratorDialect = {
	server: "PostgreSQL",
	sql,
	target: "url",
	connect: async (url) =>
		(await import("../../postgres/driver.js")).connectPostgres(url),
	scan: { programs: new Set(["FUNCTION", "PROCEDURE"]), atomicBodies: true },
	split: false,
	open,
	schema: "postgres",
};
