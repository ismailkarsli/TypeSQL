import { Kysely, Generated, PostgresDialect } from "kysely";
import { createSql } from "@typesql/kysely";
import { postgres } from "@typesql/core/postgres";
import { Pool } from "pg";
const connection = new Pool({ connectionString: process.env.DATABASE_URL });
await connection.query(
	"CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, bio text)",
);
const dialect = new PostgresDialect({ pool: connection });
interface DB {
	users: { id: Generated<number>; name: string; bio: string | null };
}
const db = new Kysely<DB>({ dialect });
const sql = createSql(postgres, db);
await db.insertInto("users").values({ name: "Ada", bio: null }).execute();
export const rows = await sql(
	"SELECT id, name, bio FROM users ORDER BY id",
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log((error as Error).message);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
console.log({ rows, after });
await db.destroy();
