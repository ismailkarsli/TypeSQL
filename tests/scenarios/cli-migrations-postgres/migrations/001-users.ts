import { migration } from "@typesql/core/migration";
export default migration("postgres", {
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, bio text)",
		),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
