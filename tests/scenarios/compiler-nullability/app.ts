import { createSql } from "@typesql/core";
import { postgres, type Col } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
}
const sql = createSql<DB>(postgres);
sql("INSERT INTO users (id, name) VALUES ($1, $2)", 1, null);
sql("INSERT INTO users (id) VALUES ($1)", 1);
sql(`UPDATE users SET name = ${sql.param(null)}`);
sql("SELECT slugify(name) FROM users");
