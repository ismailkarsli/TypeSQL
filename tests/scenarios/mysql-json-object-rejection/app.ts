import { createSql } from "@typesql/core";
import { type Col, type Json, mysql } from "@typesql/core/mysql";

interface DB {
	posts: {
		id: Col<"int">;
		data: Col<"json">;
		meta: Json<{ theme: string }, { nullable: true }>;
	};
}
const sql = createSql<DB>(mysql);
const meta = { theme: "dark" };

// MySQL drivers bind JSON as text: sql.json() writes it, a plain object
// is no MySQL value.
sql(
	"UPDATE posts SET data = $1, meta = $2 WHERE id = $3",
	sql.json(meta),
	sql.json(meta),
	1,
);
sql(
	"UPDATE posts SET data = $1, meta = $2 WHERE id = $3",
	'{"theme":"dark"}',
	null,
	1,
);
sql("UPDATE posts SET data = $1 WHERE id = 1", meta);
sql("UPDATE posts SET meta = $1 WHERE id = 1", meta);
sql("UPDATE posts SET meta = :meta WHERE id = 1", { meta });
sql(`UPDATE posts SET ${sql.set("posts", { meta })} WHERE id = 1`);
