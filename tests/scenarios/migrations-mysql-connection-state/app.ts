import type { Executor } from "@typesql/core";
import {
	createMigrator,
	MigrationError,
	migration,
} from "@typesql/core/migration";
import { executor } from "@typesql/mysql";
import { createConnection, type RowDataPacket } from "mysql2/promise";

const connection = await createConnection(process.env.DATABASE_URL!);
const read = async (query: string) =>
	(await connection.query<RowDataPacket[]>(query))[0];
const autocommit = async () =>
	(await read("SELECT @@autocommit AS value"))[0]?.value;

try {
	console.log("autocommit before", await autocommit());

	// MySQL rejects a table name that ends in a space: the history table can't
	// be created after the migrator turned autocommit off.
	await createMigrator({
		dialect: "mysql",
		migrationTable: "history ",
		migrations: [],
		execute: executor(connection),
	})
		.latest()
		.catch((error: Error) => console.log("open failed:", error.message));
	console.log("autocommit after a failed open", await autocommit());

	const first = migration("mysql", {
		name: "001-notes",
		up: async (db) => db.ddl("CREATE TABLE notes (body VARCHAR(20) NOT NULL)"),
		down: async (db) => {
			await db.ddl("DROP TABLE notes");
		},
	});
	let refuseProbe = false;
	const second = migration(first, {
		name: "002-failure",
		up: async (db) => {
			const next = await db.raw("INSERT INTO notes (body) VALUES ('partial')");
			refuseProbe = true;
			return next.raw("INSERT INTO notes (body) VALUES (NULL)");
		},
		down: async (db) => db,
	});
	// The savepoint probe of a failed migration's rollback fails on the way.
	const base = executor(connection);
	const execute: Executor = async (text, values) => {
		if (refuseProbe && text.startsWith("RELEASE SAVEPOINT")) {
			refuseProbe = false;
			throw new Error("the server refused the probe");
		}
		return base(text, values);
	};
	try {
		await createMigrator({
			dialect: "mysql",
			migrations: [first, second],
			execute,
		}).latest();
	} catch (error) {
		if (!(error instanceof MigrationError)) throw error;
		console.log("failed migration:", error.migration, error.rolledBack);
	}
	console.log(
		"rows after the failed migration",
		await read("SELECT body FROM notes"),
	);
	console.log("autocommit after the failed migration", await autocommit());
} finally {
	await connection.end();
}
