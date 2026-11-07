import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";

interface DB {
	users: { id: Col<"int4">; email: Col<"text"> };
}
const sql = createSql<DB>();
export const query = sql("SELECT id FROM users");
