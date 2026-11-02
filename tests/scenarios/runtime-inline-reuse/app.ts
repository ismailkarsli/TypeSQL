import { createSql } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";
const sql = createSql<{}>(postgres);
const one = sql.param(1);
sql(`SELECT ${one}::int AS n`);
sql(`SELECT ${one}::int AS n`);
