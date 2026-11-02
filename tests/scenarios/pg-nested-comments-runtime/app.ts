import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createPostgresSql } from "@typesql/postgres";
import { Pool } from "pg";
import postgres from "postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = postgres(process.env.DATABASE_URL!);
const native = "SELECT 1 AS n /* outer /* inner */ :ignored */ WHERE 1=$1";
console.log("native pg", (await pool.query(native, [1])).rows);
console.log("native postgres", Array.from(await client.unsafe(native, [1])));
const adapters = [
	["pg", createPgSql<{}>(pool)],
	["postgres", createPostgresSql<{}>(client)],
] as const;
for (const [adapter, sql] of adapters) {
	try {
		const named = sql.as<{ n: number }>(
			"SELECT 1 AS n /* outer /* inner */ :ignored */ WHERE 1=:id",
			{ id: 1 },
		);
		console.log(adapter, "named", named.text, named.values);
		console.log(adapter, "named rows", await named.execute());
	} catch (error) {
		console.log(adapter, "named error", String(error));
	}
	try {
		const fragment = sql.as<{ n: number }>(
			`SELECT 1 AS n /* outer /* inner */ $99 */ WHERE 1=$1 ${sql.fragment("AND 1=$1", 1)}`,
			1,
		);
		console.log(adapter, "fragment", fragment.text, fragment.values);
		console.log(adapter, "fragment rows", await fragment.execute());
	} catch (error) {
		console.log(adapter, "fragment error", String(error));
	}
}
await pool.end();
await client.end();
