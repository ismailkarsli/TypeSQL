import {
	createMigrator,
	migration,
	type SchemaOf,
} from "@typesql/core/migration";
import type { Col, Sig } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
	$functions: {
		// RETURNS users: one row, all NULL when no user matches.
		user_by_id: Sig<["int4"], "users">;
		// RETURNS SETOF users: rows of the table.
		users_named: Sig<["text"], "users", { srf: true }>;
		// RETURNS TABLE (id int, label text): columns declared one by one.
		user_cards: Sig<
			["int4"],
			"record",
			{ srf: true; columns: { id: Col<"int4">; label: "text" } }
		>;
		greet: Sig<["text"], "text", { strict: false; nullable: false }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
	CREATE TABLE users (id integer NOT NULL, name text NOT NULL, bio text);
	INSERT INTO users VALUES (1, 'ada', NULL), (2, 'alan', 'computing');
	CREATE FUNCTION user_by_id(uid integer) RETURNS users
		LANGUAGE sql AS $$ SELECT * FROM users WHERE id = uid $$;
	CREATE FUNCTION users_named(prefix text) RETURNS SETOF users
		LANGUAGE sql AS $$ SELECT * FROM users WHERE name LIKE prefix || '%' ORDER BY id $$;
	CREATE FUNCTION user_cards(min_id integer) RETURNS TABLE (id integer, label text)
		LANGUAGE sql AS $$ SELECT id, name || ': ' || coalesce(bio, '-') FROM users WHERE id >= min_id ORDER BY id $$;
	CREATE FUNCTION greet(name text DEFAULT NULL) RETURNS text
		LANGUAGE sql AS $$ SELECT 'hello ' || coalesce(name, 'anonymous') $$;
`);

// A function returning a table's row type has that table's columns. One row
// that may not exist is all NULL then, so its columns are nullable.
export const found = await sql(
	`SELECT * FROM user_by_id(${sql.param(2)})`,
).execute();
export const missing = await sql(
	`SELECT u.id, u.name FROM user_by_id(${sql.param(9)}) u`,
).execute();
// SETOF keeps the table's own nullability.
export const named = await sql(
	`SELECT * FROM users_named(${sql.param("a")}) u`,
).execute();
// RETURNS TABLE: the declared columns, aliased like any relation.
export const cards = await sql(
	`SELECT c.id, c.label FROM user_cards(${sql.param(1)}) AS c`,
).execute();

// A function argument accepts NULL, positional or named, cast or not.
const nobody = process.env.TYPESQL_NO_SUCH_NAME ?? null;
export const positional = await sql(
	`SELECT greet(${sql.param(nobody)}::text) AS g`,
).execute();
export const namedCast = await sql(
	`SELECT greet(name => ${sql.param(nobody)}::text) AS g`,
).execute();
export const namedValue = await sql(
	`SELECT greet(name => ${sql.param("grace")}::text) AS g`,
).execute();

// Functions a migration creates are read the same way.
const notes = migration("postgres", {
	name: "001-notes",
	up: async (db) =>
		db.ddl(`
			CREATE TABLE notes (id integer NOT NULL, title text NOT NULL);
			CREATE FUNCTION note_by_id(nid integer) RETURNS notes
				LANGUAGE sql AS $$ SELECT * FROM notes WHERE id = nid $$;
			CREATE FUNCTION note_cards() RETURNS TABLE (id integer, title text)
				LANGUAGE sql AS $$ SELECT id, upper(title) FROM notes ORDER BY id $$;
		`),
	down: async (db) => {
		await db.ddl(
			"DROP FUNCTION note_cards; DROP FUNCTION note_by_id; DROP TABLE notes",
		);
	},
});
await createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [notes],
}).latest();
const migrated = createSql<SchemaOf<typeof notes>>(pool);
await pool.query("INSERT INTO notes VALUES (1, 'first'), (2, 'second')");
export const migratedRow = await migrated(
	"SELECT n.id, n.title FROM note_by_id(1) n",
).execute();
export const migratedTable = await migrated(
	"SELECT * FROM note_cards() c",
).execute();

console.dir(
	{
		found,
		missing,
		named,
		cards,
		positional,
		namedCast,
		namedValue,
		migratedRow,
		migratedTable,
	},
	{ depth: null },
);
await pool.end();
