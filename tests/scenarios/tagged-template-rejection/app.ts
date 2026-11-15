import { createSql } from "@typesql/core";
import { type Col, postgresDialect } from "@typesql/core/postgres";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
}
const sql = createSql<DB>(postgresDialect);
const id = 1;

sql`SELECT id FROM users`;
sql`SELECT name FROM users WHERE id = ${sql.param(id)}`;
