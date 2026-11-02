import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createPostgresSql } from "@typesql/postgres";
import { Pool } from "pg";
import postgres from "postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = postgres(process.env.DATABASE_URL!);
const pgSql = createPgSql<{}>(pool);
const postgresSql = createPostgresSql<{}>(client);
const named = "SELECT 1 AS n /* outer /* inner */ :ignored */ WHERE 1=:id";
export const pgNamed = await pgSql(named, { id: 1 }).execute();
export const postgresNamed = await postgresSql(named, { id: 1 }).execute();
export const pgPrepared = await pgSql.prepare(named)({ id: 1 }).execute();
export const postgresPrepared = await postgresSql
	.prepare(named)({ id: 1 })
	.execute();

const pgQuery = pgSql(
	`SELECT 1 AS n /* outer /* inner */ $99 */ WHERE 1=$1 ${pgSql.fragment("AND 1=$1 /* outer /* inner */ $88 */", 1)}`,
	1,
);
const postgresQuery = postgresSql(
	`SELECT 1 AS n /* outer /* inner */ $99 */ WHERE 1=$1 ${postgresSql.fragment("AND 1=$1 /* outer /* inner */ $88 */", 1)}`,
	1,
);
console.log("pg", pgQuery.text, pgQuery.values);
console.log("postgres", postgresQuery.text, postgresQuery.values);
export const pgFragment = await pgQuery.execute();
export const postgresFragment = await postgresQuery.execute();
export const pgInline = await pgSql(
	`SELECT 1 AS n /* outer /* middle /* inner */ :ignored */ $99 */ WHERE 1=${pgSql.param(1)}`,
).execute();
export const postgresInline = await postgresSql(
	`SELECT 1 AS n /* outer /* middle /* inner */ :ignored */ $99 */ WHERE 1=${postgresSql.param(1)}`,
).execute();
const controls =
	"SELECT ':ignored $99 /*'::text AS quoted, $tag$:ignored $98 /*$tag$ AS dollar, E'it\\'s :ignored $97 /*'::text AS escaped /* :ignored $96 */ WHERE 1=:id -- :ignored $95\n";
export const pgControls = await pgSql(controls, { id: 1 }).execute();
export const postgresControls = await postgresSql(controls, {
	id: 1,
}).execute();
console.log("pg controls", JSON.stringify(pgControls));
console.log("postgres controls", JSON.stringify(postgresControls));
console.log({
	pgNamed,
	postgresNamed,
	pgPrepared,
	postgresPrepared,
	pgFragment,
	postgresFragment,
	pgInline,
	postgresInline,
});
await pool.end();
await client.end();
