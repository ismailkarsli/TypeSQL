import { createSql } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";

const sql = createSql<{}>(postgres);
await sql("SELECT 1 AS n").execute();
