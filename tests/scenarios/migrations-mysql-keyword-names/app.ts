import { createMigrator, migration } from "@typesql/core/migration";

const down = async (): Promise<void> => {};
const tables = migration("mysql", {
	name: "001-spans",
	down,
	up: async (db) => {
		await db.raw("CREATE TABLE spans (id INT, `end` INT, `begin` INT)");
		return db;
	},
});
// `NEW.end` and `AS end` are names: the statements after them are in the body.
const body = migration(tables, {
	name: "002-trigger",
	down,
	up: async (db) => {
		await db.raw(`
			CREATE TRIGGER spans_end BEFORE INSERT ON spans FOR EACH ROW
			BEGIN
				SET NEW.end = NEW.id + 1;
				SET @last = (SELECT 1 AS end);
			END;
		`);
		return db;
	},
});
// `begin` opens no body in these, so the COMMIT is its own statement.
const commits = [
	"CREATE PROCEDURE a(begin INT) SELECT 1; COMMIT",
	"CREATE PROCEDURE begin() SELECT 1; COMMIT",
	"CREATE PROCEDURE app.begin() SELECT 1; COMMIT",
	// CASE … END FOR UPDATE ends the CASE, and BEGIN's END the body.
	"CREATE PROCEDURE b() BEGIN SELECT id FROM spans ORDER BY CASE WHEN id > 0 THEN 1 END FOR UPDATE; END; COMMIT",
];

const url = process.env.DATABASE_URL;
const latest = async (next: typeof body): Promise<void> => {
	try {
		await createMigrator({
			dialect: "mysql",
			url,
			migrations: [tables, next],
		}).latest();
		console.log("applied", next.name);
	} catch (error) {
		console.log(error instanceof Error ? error.message : error);
	}
};
for (const [i, script] of commits.entries())
	await latest(
		migration(tables, {
			name: `002-commit-${i}`,
			down,
			up: async (db) => {
				await db.raw(script);
				return db;
			},
		}),
	);
await latest(body);
