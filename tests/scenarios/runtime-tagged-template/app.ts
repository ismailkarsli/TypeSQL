import { createSql } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";
import { userIds } from "./queries.js";

interface DB {
	users: { id: Col<"int4"> };
}
const sql = createSql<DB>(postgres);
userIds(sql);
