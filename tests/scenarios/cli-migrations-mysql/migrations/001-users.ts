import { migration } from "@typesql/core/migration";
export default migration("mysql", {
	up: async (db) =>
		db.ddl(
			"CREATE TABLE users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, role ENUM('admin', 'member') NOT NULL DEFAULT 'member', bio TEXT)",
		),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});
