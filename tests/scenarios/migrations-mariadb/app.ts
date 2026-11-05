import {
	createMigrator,
	MigrationError,
	migration,
} from "@typesql/core/migration";

const first = migration("mariadb", {
	name: "001-users",
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL)",
		),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
const second = migration(first, {
	name: "002-bio",
	up: async (db) => {
		const next = await db.ddl("ALTER TABLE users ADD COLUMN bio TEXT");
		await next(
			"INSERT INTO users (name, bio) VALUES ($1, $2) RETURNING id",
			"Ada",
			null,
		).execute();
		return next;
	},
	down: async (db) => {
		await db.ddl("ALTER TABLE users DROP COLUMN bio");
	},
});
const migrator = createMigrator({
	dialect: "mariadb",
	url: process.env.DATABASE_URL,
	migrations: [first, second],
});
console.log({ latest: await migrator.latest() });
console.log({
	status: (await migrator.status()).map(({ name, applied }) => ({
		name,
		applied,
	})),
});
console.log({ down: await migrator.down() });
console.log({ again: await migrator.latest() });
try {
	await migrator.with({ migrations: [second] }).latest();
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
