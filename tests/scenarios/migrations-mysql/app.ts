import {
	createMigrator,
	MigrationError,
	migration,
} from "@typesql/core/migration";

const first = migration("mysql", {
	name: "001-users",
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL)",
		),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
const failed = migration(first, {
	name: "002-failure",
	up: async (db) => {
		const next = await db.ddl("CREATE TABLE temporary (id INT)");
		await next.raw("INSERT INTO users (id, name) VALUES (1, NULL)");
		return next;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE temporary");
	},
});
const migrator = createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrations: [first, failed],
});
try {
	await migrator.latest();
} catch (error) {
	if (!(error instanceof MigrationError)) throw error;
	console.log({
		name: error.name,
		message: error.message,
		migration: error.migration,
		rolledBack: error.rolledBack,
		applied: error.applied,
	});
}

import { createConnection } from "mysql2/promise";

const db = await createConnection(process.env.DATABASE_URL!);
const inspect = async () =>
	(await db.query("SELECT name FROM schema_migrations ORDER BY name"))[0];
const tables = async () =>
	(
		await db.query(
			"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
		)
	)[0];
console.log({ history: await inspect() });
console.log({
	status: (await migrator.status()).map(({ name, applied }) => ({
		name,
		applied,
	})),
});
console.log({ tables: await tables() });
await db.query("DROP TABLE temporary");
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
	{ tablesWithoutTransaction: await tables(), history: await inspect() },
	{ depth: null },
);
await db.end();
