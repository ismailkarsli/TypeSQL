import { migration } from "@typesql/core/migration";
import type { Col, Json } from "@typesql/core/postgres";

// A schema stated with .raw<…>() keeps its column helpers in the generated
// schema: Json<T> for a JSON column with a TypeScript type.
export default migration("postgres", {
	up: async (db) =>
		db.raw<{
			settings: {
				id: Col<"int4">;
				value: Json<{ theme: "light" | "dark" }>;
				backup: Json<{ theme: "light" | "dark" }, { nullable: true }, "json">;
			};
		}>(
			"CREATE TABLE settings (id integer PRIMARY KEY, value jsonb NOT NULL, backup json)",
		),
	down: async (db) => {
		await db.ddl("DROP TABLE settings");
	},
});
