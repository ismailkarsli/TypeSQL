import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/kysely";
import { type Generated, Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";

const pool = createPool(process.env.DATABASE_URL!);
const dialect = new MysqlDialect({ pool });
interface DB {
	users: { id: Generated<number>; name: string; bio: string | null };
}
const db = new Kysely<DB>({ dialect });
await db.schema
	.createTable("users")
	.addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
	.addColumn("name", "varchar(100)", (c) => c.notNull())
	.addColumn("bio", "varchar(100)")
	.execute();
const sql = createSql(mysql, db);
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
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
export const changed = await sql(
	"UPDATE users SET bio = $1 WHERE id = $2",
	"Engineer",
	1,
).executeCount();
console.log({ rows, after, changed });
await db.destroy();
