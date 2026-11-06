import { migration } from "@typesql/core/migration";
export default migration("sqlite", {
	up: async (db) => db.ddl("CREATE VIRTUAL TABLE docs USING fts5(title, body)"),
	down: async (db) => {
		await db.ddl("DROP TABLE docs");
	},
});
