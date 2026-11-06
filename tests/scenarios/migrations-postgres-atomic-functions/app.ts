import { createMigrator, migration } from "@typesql/core/migration";
import { Pool } from "pg";

// SQL-standard routine bodies: their BEGIN and END are no transaction control.
const routines = migration("postgres", {
	name: "001-routines",
	up: async (db) => {
		await db.raw(`
			CREATE FUNCTION add_one(n integer) RETURNS integer
			BEGIN ATOMIC
				SELECT CASE WHEN n IS NULL THEN 0 ELSE n + 1 END;
			END;
			CREATE OR REPLACE PROCEDURE noop()
			BEGIN ATOMIC
				SELECT 1;
			END;
			CREATE TABLE after_routines (id integer);
		`);
		return db;
	},
	down: async (db) => {
		await db.raw("DROP FUNCTION add_one; DROP PROCEDURE noop");
	},
});
// A statement after a routine, or after a dollar-quoted body, is still checked.
const down = async (): Promise<void> => {};
const afterAtomic = migration(routines, {
	name: "002-commit-after-atomic",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION two() RETURNS integer BEGIN ATOMIC SELECT 2; END; COMMIT",
		);
		return db;
	},
});
const afterQuoted = migration(routines, {
	name: "002-commit-after-quoted",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION three() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 3; END $$; COMMIT",
		);
		return db;
	},
});
const bare = migration(routines, {
	name: "002-bare-begin",
	down,
	up: async (db) => {
		await db.raw("BEGIN");
		return db;
	},
});

// `begin` names a parameter, a function and a column here; it opens no body.
const afterParameter = migration(routines, {
	name: "002-commit-after-parameter",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION overlap(begin date, finish date) RETURNS boolean LANGUAGE sql AS $$ SELECT begin < finish $$; COMMIT",
		);
		return db;
	},
});
const afterName = migration(routines, {
	name: "002-commit-after-name",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION begin() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$; COMMIT",
		);
		return db;
	},
});
const afterAlias = migration(routines, {
	name: "002-commit-after-alias",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION four() RETURNS integer BEGIN ATOMIC SELECT 4 AS begin; END; COMMIT",
		);
		return db;
	},
});
// `CASE … END FOR UPDATE` ends the CASE; FOR here starts a locking clause.
const afterLocking = migration(routines, {
	name: "002-commit-after-locking",
	down,
	up: async (db) => {
		await db.raw(
			"CREATE FUNCTION five() RETURNS integer BEGIN ATOMIC SELECT 5 FROM after_routines ORDER BY CASE WHEN id > 0 THEN 1 END FOR UPDATE; END; COMMIT",
		);
		return db;
	},
});
// `end` as a name closes nothing: both statements are in the body.
const names = migration(routines, {
	name: "003-end-as-a-name",
	down,
	up: async (db) => {
		await db.raw(`
			CREATE TABLE spans ("end" integer);
			CREATE FUNCTION last_end() RETURNS integer
			BEGIN ATOMIC
				SELECT s.end FROM spans s;
				SELECT 1 AS end;
			END;
		`);
		return db;
	},
});

const url = process.env.DATABASE_URL;
await createMigrator({
	dialect: "postgres",
	url,
	migrations: [routines],
}).latest();
const pool = new Pool({ connectionString: url });
const { rows } = await pool.query("SELECT add_one(1) AS two");
console.log(rows);
for (const next of [
	afterAtomic,
	afterQuoted,
	bare,
	afterParameter,
	afterName,
	afterAlias,
	afterLocking,
	names,
]) {
	try {
		await createMigrator({
			dialect: "postgres",
			url,
			migrations: [routines, next],
		}).latest();
		console.log("applied");
	} catch (error) {
		console.log(error instanceof Error ? error.message : error);
	}
}
await pool.end();
