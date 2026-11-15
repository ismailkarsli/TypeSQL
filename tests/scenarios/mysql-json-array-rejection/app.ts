import { createSql } from "@typesql/core";
import { type Json, mysqlDialect } from "@typesql/core/mysql";

interface DB {
	posts: { tags: Json<string[]> };
}
const sql = createSql<DB>(mysqlDialect);
const tags = ["sql", "types"];

sql(`UPDATE posts SET tags = ${sql.param(tags)}`);
