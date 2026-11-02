import { createSql } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
}
const sql = createSql<DB>(postgres);
sql("SELECT id FROM users WHERE id = $1", "wrong");
sql("SELECT missing FROM users");
