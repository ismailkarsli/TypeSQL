import { createSql } from "@typesql/core";
import { type Json, mysql } from "@typesql/core/mysql";

interface DB {
	posts: { tags: Json<string[]> };
}
const sql = createSql<DB>(mysql);
const tags = ["sql", "types"];

sql(`UPDATE posts SET tags = ${sql.param(tags)}`);
