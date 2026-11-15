import { createSql } from "@typesql/core";
import { postgresDialect } from "@typesql/core/postgres";

const sql = createSql<{}>(postgresDialect);
const one = sql.param(1);
sql(`SELECT ${one}::int AS n`);
sql(`SELECT ${one}::int AS n`);
