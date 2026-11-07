import { migration } from "@typesql/core/migration";

export default migration("postgres", {
	up: async (db) =>
		db.ddl(`
			CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, type text);
			CREATE  TABLE posts (id int PRIMARY KEY,author_id int NOT NULL REFERENCES users(id), title text)
		`),
	down: async (db) => {
		await db.ddl("DROP TABLE posts; DROP TABLE users");
	},
});
