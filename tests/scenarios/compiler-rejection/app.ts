import { createSql } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
}
const sql = createSql<DB>(postgres);
sql("SELECT id FROM users WHERE id = $1", "wrong");
sql("SELECT missing FROM users");

sql("SELECT id FROM users WHERE sum(id) > 0");
sql("SELECT id FROM users WHERE row_number() OVER () > 0");
sql("SELECT sum(sum(id)) FROM users");
sql("SELECT sum(row_number() OVER ()) FROM users");
