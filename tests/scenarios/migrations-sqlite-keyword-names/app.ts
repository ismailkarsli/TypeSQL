import { createMigrator, migration } from "@typesql/core/migration";

const down = async (): Promise<void> => {};
const tables = migration("sqlite", {
	name: "001-spans",
	down,
	up: async (db) => {
		await db.raw('CREATE TABLE spans (id integer, "end" integer)');
		return db;
	},
});
// `NEW.end` is a name: the trigger is one statement, with all of its body.
const trigger = migration(tables, {
	name: "002-trigger",
	down,
	up: async (db) => {
		await db.raw(`
			CREATE TRIGGER spans_end AFTER INSERT ON spans
			BEGIN
				UPDATE spans SET id = NEW.end WHERE id IS NULL;
				SELECT 1;
			END;
		`);
		return db;
	},
});
// `begin` names the trigger, so the COMMIT is its own statement.
const commit = migration(tables, {
	name: "002-commit",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE TRIGGER begin AFTER INSERT ON spans BEGIN SELECT 1; END; COMMIT",
		);
		return db;
	},
});

const db = process.env.SQLITE_PATH;
for (const next of [commit, trigger]) {
	try {
		await createMigrator({
			dialect: "sqlite",
			db,
			migrations: [tables, next],
		}).latest();
		console.log("applied", next.name);
	} catch (error) {
		console.log(error instanceof Error ? error.message : error);
	}
}
