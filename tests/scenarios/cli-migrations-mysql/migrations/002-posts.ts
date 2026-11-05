import { migration } from "@typesql/core/migration";
import previous from "./001-users.js";
export default migration(previous, {
	up: async (db) => {
		const next = await db.ddl(
			"CREATE TABLE posts (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, author_id INT UNSIGNED NOT NULL, title VARCHAR(200) NOT NULL, FOREIGN KEY (author_id) REFERENCES users (id)); ALTER TABLE users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER name",
		);
		await next("INSERT INTO users (name) VALUES ($1)", "Ada").execute();
		return next;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE posts; ALTER TABLE users DROP COLUMN created_at");
	},
});
