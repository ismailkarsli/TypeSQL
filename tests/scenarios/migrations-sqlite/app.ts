import {
	createMigrator,
	MigrationError,
	migration,
} from "@typesql/core/migration";

const first = migration("sqlite", {
	name: "001-users",
	up: async (db) =>
		db.ddl("CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL)"),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
const failed = migration(first, {
	name: "002-failure",
	up: async (db) => {
		const next = await db.ddl("CREATE TABLE temporary (id integer)");
		await next.raw("INSERT INTO users (id, name) VALUES (1, NULL)");
		return next;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE temporary");
	},
});
const migrator = createMigrator({
	dialect: "sqlite",
	db: process.env.SQLITE_PATH,
	migrations: [first, failed],
});
try {
	await migrator.latest();
} catch (error) {
	if (!(error instanceof MigrationError)) throw error;
	console.log({
		name: error.name,
		migration: error.migration,
		rolledBack: error.rolledBack,
		applied: error.applied,
	});
}

import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const inspect = async () =>
	db.prepare("SELECT name FROM schema_migrations ORDER BY name").all();
console.log({ history: await inspect() });
console.log({
	status: (await migrator.status()).map(({ name, applied }) => ({
		name,
		applied,
	})),
});
const tables = db
	.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
	.all();
console.log({ tables });
const good = migrator.with({ migrations: [first] });
console.log({ again: await good.latest() });
console.log({ down: await good.down() });
console.log({ history: await inspect() });
try {
	await migrator.with({ transaction: false }).latest();
} catch (error) {
	if (!(error instanceof MigrationError)) throw error;
	console.log({
		name: error.name,
		migration: error.migration,
		rolledBack: error.rolledBack,
		applied: error.applied,
	});
}
console.dir(
	{
		tablesWithoutTransaction: db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
			)
			.all(),
		history: await inspect(),
	},
	{ depth: null },
);
db.close();
