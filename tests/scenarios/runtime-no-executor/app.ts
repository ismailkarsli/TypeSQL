import { createSql } from "@typesql/core";
import { postgresDialect } from "@typesql/core/postgres";

const sql = createSql<{}>(postgresDialect);
await sql("SELECT 1 AS n").exec();
