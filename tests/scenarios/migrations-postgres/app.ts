import { createMigrator, migration } from "@typesql/core/migration";
const first = migration("postgres", {
	name: "001-users",
	up: async (db) =>
		db.ddl("CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL)"),
	down: async (db) => {
		await db.add("DROP TABLE users");
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
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [first, failed],
});
try {
	await migrator.latest();
} catch (error) {
	const e = error as Error & {
		migration: string;
		rolledBack: boolean;
		applied: string[];
	};
	console.log({
		name: e.name,
		migration: e.migration,
		rolledBack: e.rolledBack,
		applied: e.applied,
	});
}
import { Pool } from "pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const inspect = async () =>
	(await db.query("SELECT name FROM schema_migrations ORDER BY name")).rows;
console.log({ history: await inspect() });
console.log({
	status: (await migrator.status()).map(({ name, applied }) => ({
		name,
		applied,
	})),
});
const tables = (
	await db.query(
		"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
	)
).rows;
console.log({ tables });
const good = migrator.with({ migrations: [first] });
console.log({ again: await good.latest() });
console.log({ down: await good.down() });
console.log({ history: await inspect() });
try {
	await migrator.with({ transaction: false }).latest();
} catch (error) {
	const e = error as Error & {
		migration: string;
		rolledBack: boolean;
		applied: string[];
	};
	console.log({
		name: e.name,
		migration: e.migration,
		rolledBack: e.rolledBack,
		applied: e.applied,
	});
}
console.dir(
	{
		tablesWithoutTransaction: (
			await db.query(
				"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
			)
		).rows,
		history: await inspect(),
	},
	{ depth: null },
);
await db.end();
