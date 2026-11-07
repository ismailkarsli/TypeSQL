import { migration } from "@typesql/core/migration";

// An index names columns of its table, in key parts, expressions, INCLUDE and
// WHERE; the database rejects one that doesn't exist when the migration runs.
const pgUsers = migration("postgres", {
	name: "001-users",
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id integer PRIMARY KEY, email text NOT NULL, created_at timestamptz, deleted_at timestamptz)",
		),
	down: async (db) => db.ddl("DROP TABLE users"),
});
export const pgIndexes = migration(pgUsers, {
	name: "002-indexes",
	up: async (db) =>
		db.ddl(
			'CREATE UNIQUE INDEX IF NOT EXISTS users_email ON ONLY users USING btree (lower(email) text_pattern_ops DESC NULLS LAST, id) INCLUDE (created_at) WHERE deleted_at IS NULL; CREATE INDEX ON users (email COLLATE "C")',
		),
	down: async (db) => db.ddl("DROP INDEX users_email"),
});
migration(pgUsers, {
	name: "002-column",
	up: async (db) => db.ddl("CREATE INDEX users_email ON users (emial)"),
	down: async () => {},
});
migration(pgUsers, {
	name: "002-expression",
	up: async (db) => db.ddl("CREATE INDEX users_email ON users (lower(emial))"),
	down: async () => {},
});
migration(pgUsers, {
	name: "002-include",
	up: async (db) =>
		db.ddl("CREATE INDEX users_email ON users (email) INCLUDE (created)"),
	down: async () => {},
});
migration(pgUsers, {
	name: "002-predicate",
	up: async (db) =>
		db.ddl("CREATE INDEX users_email ON users (email) WHERE deleted IS NULL"),
	down: async () => {},
});
migration(pgUsers, {
	name: "002-table",
	up: async (db) => db.ddl("CREATE INDEX users_email ON accounts (email)"),
	down: async () => {},
});

const myUsers = migration("mysql", {
	name: "001-users",
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id int PRIMARY KEY, email varchar(255) NOT NULL)",
		),
	down: async (db) => db.ddl("DROP TABLE users"),
});
export const myIndexes = migration(myUsers, {
	name: "002-indexes",
	up: async (db) =>
		db.ddl(
			"CREATE UNIQUE INDEX users_email USING BTREE ON users (Email(10) DESC, (lower(email)), id) COMMENT 'login'",
		),
	down: async (db) => db.ddl("DROP INDEX users_email ON users"),
});
migration(myUsers, {
	name: "002-column",
	up: async (db) => db.ddl("CREATE INDEX users_email ON users (emial(10))"),
	down: async () => {},
});
migration(myUsers, {
	name: "002-expression",
	up: async (db) =>
		db.ddl("CREATE INDEX users_email ON users ((lower(emial)))"),
	down: async () => {},
});

const liteUsers = migration("sqlite", {
	name: "001-users",
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id integer PRIMARY KEY, email text NOT NULL, deleted_at text); CREATE VIEW live AS SELECT id FROM users WHERE deleted_at IS NULL",
		),
	down: async (db) => db.ddl("DROP VIEW live; DROP TABLE users"),
});
export const liteIndexes = migration(liteUsers, {
	name: "002-indexes",
	up: async (db) =>
		db.ddl(
			"CREATE UNIQUE INDEX users_email ON users (lower(email) COLLATE NOCASE DESC, id) WHERE deleted_at IS NULL",
		),
	down: async (db) => db.ddl("DROP INDEX users_email"),
});
migration(liteUsers, {
	name: "002-column",
	up: async (db) => db.ddl("CREATE INDEX users_email ON users (emial)"),
	down: async () => {},
});
migration(liteUsers, {
	name: "002-predicate",
	up: async (db) =>
		db.ddl("CREATE INDEX users_email ON users (email) WHERE deleted IS NULL"),
	down: async () => {},
});
migration(liteUsers, {
	name: "002-view",
	up: async (db) => db.ddl("CREATE INDEX live_id ON live (id)"),
	down: async () => {},
});
