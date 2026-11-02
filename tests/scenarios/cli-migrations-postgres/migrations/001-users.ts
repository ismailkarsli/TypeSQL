import { migration } from "@typesql/core/migration";
export default migration("postgres", {
	up: async (db) =>
		db.add(
			"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, bio text)",
		),
	down: async (db) => {
		await db.add("DROP TABLE users");
	},
});
